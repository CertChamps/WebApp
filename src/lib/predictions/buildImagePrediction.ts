import {
  groupImageQuestions,
  listQuestionsForTopic,
  listTopicsForSubjectLevel,
} from "../../hooks/useImageQuestions";
import { getStorageFolderName } from "../../data/practiceHubSubjects";
import { IMAGE_PREDICTION_SUBJECTS } from "./constants";
import type { PredictedPaperBlueprint, TopicForecast } from "./types";

export type ImageCatalogQuestion = {
  topic: string;
  topicDisplay: string;
  imageKey: string;
  displayName: string;
  imagePaths: string[];
  tags: string[];
  year: number;
};

function extractYear(...parts: string[]): number {
  for (const part of parts) {
    const match = part.match(/\b(19|20)\d{2}\b/);
    if (match) return parseInt(match[0], 10);
  }
  return 0;
}

function buildTopicForecast(topicWeights: Map<string, number>): TopicForecast[] {
  const sorted = [...topicWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = sorted[0]?.[1] ?? 1;
  const total = [...topicWeights.values()].reduce((sum, w) => sum + w, 0);
  return sorted.map(([topic, weight]) => ({
    topic,
    likelihood: (weight >= max * 0.7 ? "high" : weight >= max * 0.4 ? "medium" : "low") as
      | "high"
      | "medium"
      | "low",
    percent: total > 0 ? Math.round((weight / total) * 100) : 0,
    reason: `Topic has ${Math.round(weight)} questions in the image bank (weighted by recency).`,
  }));
}

/** Load grouped image questions across all topics for a subject + level. */
export async function loadImageQuestionCatalog(
  subjectSlug: string,
  level: string
): Promise<ImageCatalogQuestion[]> {
  const storageSubject = getStorageFolderName(subjectSlug);
  const topics = await listTopicsForSubjectLevel(storageSubject, level);
  const catalog: ImageCatalogQuestion[] = [];

  for (const topic of topics) {
    const flat = await listQuestionsForTopic(storageSubject, level, topic.name);
    const grouped = groupImageQuestions(flat);
    for (const group of grouped) {
      const year = extractYear(group.key, ...group.images.map((i) => i.name));
      catalog.push({
        topic: topic.name,
        topicDisplay: topic.displayName,
        imageKey: group.key,
        displayName: group.displayName,
        imagePaths: group.images.map((i) => i.storagePath),
        tags: [topic.displayName],
        year,
      });
    }
  }

  return catalog;
}

export function buildImagePredictionFromCatalog(
  catalog: ImageCatalogQuestion[],
  subjectSlug: string,
  level: string,
  targetYear: number
): PredictedPaperBlueprint {
  const topicWeights = new Map<string, number>();
  const candidates: Array<ImageCatalogQuestion & { score: number; primaryTag: string }> = [];
  const currentYear = new Date().getFullYear();

  for (const q of catalog) {
    const yearBoost = q.year > 0 ? 1 + Math.max(0, q.year - (currentYear - 8)) * 0.12 : 1;
    const topicBoost = 1;
    const score = yearBoost * topicBoost;
    topicWeights.set(q.topicDisplay, (topicWeights.get(q.topicDisplay) ?? 0) + score);
    candidates.push({
      ...q,
      score,
      primaryTag: q.topicDisplay,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const targetCount = Math.min(15, Math.max(8, Math.round(candidates.length * 0.12)));
  const usedKeys = new Set<string>();
  const topicCounts = new Map<string, number>();
  const selections: PredictedPaperBlueprint["selections"] = [];

  for (const c of candidates) {
    if (selections.length >= targetCount) break;
    const key = `${c.topic}::${c.imageKey}`;
    if (usedKeys.has(key)) continue;
    const topicUsed = topicCounts.get(c.primaryTag) ?? 0;
    if (topicUsed >= 3) continue;

    usedKeys.add(key);
    topicCounts.set(c.primaryTag, topicUsed + 1);
    selections.push({
      slot: selections.length + 1,
      displayName: c.displayName,
      sourceTopic: c.topic,
      imageKey: c.imageKey,
      reason: `Selected from ${c.topicDisplay}${c.year ? ` (${c.year})` : ""} — common topic in the image bank.`,
    });
  }

  if (selections.length === 0) {
    throw new Error("Not enough image questions to build a prediction.");
  }

  const subjectLabel =
    IMAGE_PREDICTION_SUBJECTS.find((s) => s.id === subjectSlug)?.label ??
    subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const levelLabel =
    level === "higher" ? "HL" : level === "ordinary" ? "OL" : level.toUpperCase();

  const topTopics = buildTopicForecast(topicWeights)
    .filter((t) => t.likelihood === "high")
    .slice(0, 4)
    .map((t) => t.topic);

  return {
    contentType: "image",
    label: `${targetYear} ${subjectLabel} ${levelLabel} Prediction`,
    year: targetYear,
    summary: `Built from ${catalog.length} image questions across ${topicWeights.size} topics. Emphasis on ${topTopics.join(", ") || "core syllabus topics"}.`,
    topicForecast: buildTopicForecast(topicWeights),
    selections,
  };
}

export async function generatePredictedImagePaperLocally(
  subjectSlug: string,
  level: string,
  targetYear?: number
): Promise<PredictedPaperBlueprint> {
  const year = targetYear ?? new Date().getFullYear();
  const catalog = await loadImageQuestionCatalog(subjectSlug, level);
  if (catalog.length === 0) {
    throw new Error("No image questions found for this subject and level.");
  }
  return buildImagePredictionFromCatalog(catalog, subjectSlug, level, year);
}
