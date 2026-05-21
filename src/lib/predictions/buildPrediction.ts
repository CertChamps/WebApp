import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebase";
import { getFirestoreSubjectIds } from "../../data/practiceHubSubjects";
import type { PredictedPaperBlueprint, TopicForecast } from "./types";

export type CatalogQuestion = {
  id: string;
  name: string;
  tags: string[];
};

export type CatalogPaper = {
  paperId: string;
  year: number;
  label: string;
  questions: CatalogQuestion[];
};

function paperMatchesNumber(paperId: string, label: string, paperNumber: 1 | 2): boolean {
  const haystack = `${paperId} ${label}`.toLowerCase();
  const isP1 = /\bpaper\s*[- ]?1\b|\bp1\b|-p1\b|paper-1/.test(haystack);
  const isP2 = /\bpaper\s*[- ]?2\b|\bp2\b|-p2\b|paper-2/.test(haystack);
  if (paperNumber === 1) return isP1 || !isP2;
  return isP2 || !isP1;
}

/** Load past-paper question catalog from Firestore (client-side). */
export async function loadQuestionCatalog(
  subject: string,
  level: string,
  paperNumber: 1 | 2
): Promise<CatalogPaper[]> {
  const papersRef = collection(
    db,
    "questions",
    "leavingcert",
    "subjects",
    subject,
    "levels",
    level,
    "papers"
  );
  const papersSnap = await getDocs(papersRef);
  const catalog: CatalogPaper[] = [];

  for (const paperDoc of papersSnap.docs) {
    const data = paperDoc.data();
    if (data.isPrediction === true || data.isComposite === true) continue;

    const label = typeof data.label === "string" ? data.label : paperDoc.id;
    if (!paperMatchesNumber(paperDoc.id, label, paperNumber)) continue;

    const year = typeof data.year === "number" ? data.year : 0;
    const qSnap = await getDocs(collection(paperDoc.ref, "questions"));
    const questions: CatalogQuestion[] = qSnap.docs.map((d) => {
      const q = d.data();
      const tags = Array.isArray(q.tags)
        ? (q.tags as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      return {
        id: d.id,
        name: typeof q.questionName === "string" ? q.questionName : d.id,
        tags,
      };
    });

    if (questions.length === 0) continue;
    catalog.push({ paperId: paperDoc.id, year, label, questions });
  }

  catalog.sort((a, b) => b.year - a.year);
  return catalog;
}

type ScoredCandidate = {
  sourcePaperId: string;
  sourceQuestionId: string;
  name: string;
  tags: string[];
  score: number;
  primaryTag: string;
};

function primaryTag(tags: string[]): string {
  return tags[0]?.split(" - ").pop()?.trim() || tags[0] || "General";
}

function buildTopicForecast(tagWeights: Map<string, number>): TopicForecast[] {
  const sorted = [...tagWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = sorted[0]?.[1] ?? 1;
  const total = [...tagWeights.values()].reduce((sum, w) => sum + w, 0);
  return sorted.map(([topic, weight]) => ({
    topic,
    likelihood: (weight >= max * 0.7 ? "high" : weight >= max * 0.4 ? "medium" : "low") as
      | "high"
      | "medium"
      | "low",
    percent: total > 0 ? Math.round((weight / total) * 100) : 0,
    reason: `Appeared ${Math.round(weight)} times in weighted recent past papers.`,
  }));
}

/**
 * Pick a prediction paper locally from tag trends — no AI API call, zero cost.
 * Recent years are weighted more heavily; selections are diversified by topic.
 */
export function buildPredictionFromCatalog(
  catalog: CatalogPaper[],
  subject: string,
  level: string,
  paperNumber: 1 | 2,
  targetYear: number
): PredictedPaperBlueprint {
  const tagWeights = new Map<string, number>();
  const candidates: ScoredCandidate[] = [];
  const currentYear = new Date().getFullYear();

  for (const paper of catalog) {
    const yearBoost = 1 + Math.max(0, paper.year - (currentYear - 6)) * 0.15;
    for (const q of paper.questions) {
      let qScore = 0;
      for (const tag of q.tags) {
        const w = yearBoost;
        tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + w);
        qScore += w;
      }
      if (qScore === 0) qScore = 0.5;
      candidates.push({
        sourcePaperId: paper.paperId,
        sourceQuestionId: q.id,
        name: q.name,
        tags: q.tags,
        score: qScore,
        primaryTag: primaryTag(q.tags),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const targetCount = Math.min(12, Math.max(8, Math.round(candidates.length * 0.15)));
  const usedKeys = new Set<string>();
  const tagCounts = new Map<string, number>();
  const selections: PredictedPaperBlueprint["selections"] = [];

  for (const c of candidates) {
    if (selections.length >= targetCount) break;
    const key = `${c.sourcePaperId}::${c.sourceQuestionId}`;
    if (usedKeys.has(key)) continue;
    const tagUsed = tagCounts.get(c.primaryTag) ?? 0;
    if (tagUsed >= 3) continue;

    usedKeys.add(key);
    tagCounts.set(c.primaryTag, tagUsed + 1);
    selections.push({
      slot: selections.length + 1,
      displayName: c.name,
      sourcePaperId: c.sourcePaperId,
      sourceQuestionId: c.sourceQuestionId,
      reason: `Strong ${c.primaryTag} weighting from recent papers (${c.tags.slice(0, 2).join(", ") || "untagged"}).`,
    });
  }

  if (selections.length === 0) {
    throw new Error("Not enough tagged questions to build a prediction.");
  }

  const levelLabel =
    level === "higher" ? "HL" : level === "ordinary" ? "OL" : level.toUpperCase();
  const subjectLabel =
    subject === "maths"
      ? "Maths"
      : subject === "applied-maths"
        ? "Applied Maths"
        : subject.charAt(0).toUpperCase() + subject.slice(1);

  const topTopics = buildTopicForecast(tagWeights)
    .filter((t) => t.likelihood === "high")
    .slice(0, 4)
    .map((t) => t.topic);

  return {
    contentType: "pastpaper",
    label: `${targetYear} ${subjectLabel} ${levelLabel} Paper ${paperNumber} Prediction`,
    year: targetYear,
    paperNumber,
    summary: `Built from ${catalog.length} past papers using topic frequency trends (recent years weighted higher). Emphasis on ${topTopics.join(", ") || "core syllabus topics"}.`,
    topicForecast: buildTopicForecast(tagWeights),
    selections,
  };
}

export async function generatePredictedPaperLocally(
  subjectSlug: string,
  level: string,
  paperNumber: 1 | 2,
  targetYear?: number
): Promise<PredictedPaperBlueprint> {
  const year = targetYear ?? new Date().getFullYear();
  const firestoreIds = getFirestoreSubjectIds(subjectSlug);
  for (const firestoreSubject of firestoreIds) {
    const catalog = await loadQuestionCatalog(firestoreSubject, level, paperNumber);
    if (catalog.length > 0) {
      return buildPredictionFromCatalog(catalog, firestoreSubject, level, paperNumber, year);
    }
  }
  throw new Error("No past papers with questions found for this subject, level, and paper number.");
}
