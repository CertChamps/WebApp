import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import fetch from "node-fetch";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "google/gemini-3-flash-preview";

type CatalogQuestion = {
  id: string;
  name: string;
  tags: string[];
};

type CatalogPaper = {
  paperId: string;
  year: number;
  label: string;
  questions: CatalogQuestion[];
};

type TopicForecast = {
  topic: string;
  likelihood: "high" | "medium" | "low";
  reason: string;
};

type Selection = {
  slot: number;
  sourcePaperId: string;
  sourceQuestionId: string;
  reason: string;
};

export type PredictedPaperResponse = {
  label: string;
  year: number;
  paperNumber: 1 | 2;
  summary: string;
  topicForecast: TopicForecast[];
  selections: Selection[];
};

function paperMatchesNumber(paperId: string, label: string, paperNumber: 1 | 2): boolean {
  const haystack = `${paperId} ${label}`.toLowerCase();
  const isP1 = /\bpaper\s*[- ]?1\b|\bp1\b|-p1\b|paper-1/.test(haystack);
  const isP2 = /\bpaper\s*[- ]?2\b|\bp2\b|-p2\b|paper-2/.test(haystack);
  if (paperNumber === 1) return isP1 || !isP2;
  return isP2 || !isP1;
}

async function loadQuestionCatalog(
  subject: string,
  level: string,
  paperNumber: 1 | 2
): Promise<CatalogPaper[]> {
  const db = admin.firestore();
  const papersRef = db.collection(
    `questions/leavingcert/subjects/${subject}/levels/${level}/papers`
  );
  const papersSnap = await papersRef.get();
  const catalog: CatalogPaper[] = [];

  for (const paperDoc of papersSnap.docs) {
    const data = paperDoc.data();
    if (data.isPrediction === true || data.isComposite === true) continue;

    const label = typeof data.label === "string" ? data.label : paperDoc.id;
    if (!paperMatchesNumber(paperDoc.id, label, paperNumber)) continue;

    const year = typeof data.year === "number" ? data.year : 0;
    const qSnap = await paperDoc.ref.collection("questions").get();
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

function buildStatsSummary(catalog: CatalogPaper[]): string {
  const tagCounts = new Map<string, number>();
  const tagByYear = new Map<number, Map<string, number>>();

  for (const paper of catalog) {
    if (!tagByYear.has(paper.year)) tagByYear.set(paper.year, new Map());
    const yearMap = tagByYear.get(paper.year)!;
    for (const q of paper.questions) {
      for (const tag of q.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        yearMap.set(tag, (yearMap.get(tag) ?? 0) + 1);
      }
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => `${tag} (${count})`);

  const years = [...tagByYear.keys()].sort((a, b) => b - a);
  const recentYears = years.slice(0, 5).map((year) => {
    const m = tagByYear.get(year)!;
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return `${year}: ${top.map(([t, c]) => `${t}(${c})`).join(", ")}`;
  });

  return [
    `Total past papers in scope: ${catalog.length}`,
    `Top tags overall: ${topTags.join("; ")}`,
    `Recent years breakdown:\n${recentYears.join("\n")}`,
  ].join("\n\n");
}

const SYSTEM_PROMPT = `You are an expert Leaving Certificate exam analyst. Given a catalog of real past-paper questions (with ids, tags, and years), you predict which topics are likely to appear on the upcoming exam and assemble a PRACTICE prediction paper by selecting existing questions from the catalog.

Rules:
- ONLY select questions that exist in the provided catalog (exact sourcePaperId and sourceQuestionId).
- Do NOT invent new question text or ids.
- Spread selections across typical exam structure: mix of topics, difficulties, and years where appropriate.
- Prefer topics that appear frequently in recent years but include at least one "due" topic that has been absent recently if the data supports it.
- Select between 8 and 14 questions depending on how many parts a typical paper of this subject has.
- Each selection must include a clear reason tied to trend analysis.
- Return ONLY valid JSON matching the schema below. No markdown fences.

Schema:
{
  "label": "2026 Maths HL Paper 1 Prediction",
  "year": 2026,
  "paperNumber": 1,
  "summary": "2-4 sentence overview of what this prediction paper emphasises",
  "topicForecast": [
    { "topic": "Calculus", "likelihood": "high", "reason": "..." }
  ],
  "selections": [
    { "slot": 1, "sourcePaperId": "2024-p1", "sourceQuestionId": "q3", "reason": "..." }
  ]
}`;

function parseJsonResponse(raw: string): PredictedPaperResponse {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonStr) as PredictedPaperResponse;

  if (!parsed.label || !Array.isArray(parsed.selections) || parsed.selections.length === 0) {
    throw new Error("AI response missing label or selections");
  }
  if (parsed.paperNumber !== 1 && parsed.paperNumber !== 2) {
    parsed.paperNumber = 1;
  }
  return parsed;
}

function validateSelections(
  catalog: CatalogPaper[],
  response: PredictedPaperResponse
): PredictedPaperResponse {
  const valid = new Set<string>();
  for (const paper of catalog) {
    for (const q of paper.questions) {
      valid.add(`${paper.paperId}::${q.id}`);
    }
  }

  const selections = response.selections.filter((s, i) => {
    const key = `${s.sourcePaperId}::${s.sourceQuestionId}`;
    if (!valid.has(key)) return false;
    s.slot = i + 1;
    return true;
  });

  if (selections.length === 0) {
    throw new Error("AI selected no valid questions from the catalog");
  }

  return { ...response, selections };
}

export const generatePredictedPaper = functions.https.onRequest(
  {
    cors: true,
    secrets: ["OPENROUTER_API_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server configuration error" });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
    const level = typeof req.body?.level === "string" ? req.body.level.trim() : "";
    const paperNumber = req.body?.paperNumber === 2 ? 2 : 1;
    const targetYear =
      typeof req.body?.targetYear === "number" && Number.isFinite(req.body.targetYear)
        ? req.body.targetYear
        : new Date().getFullYear();

    if (!subject || !level) {
      res.status(400).json({ error: "subject and level are required" });
      return;
    }

    try {
      const catalog = await loadQuestionCatalog(subject, level, paperNumber);
      if (catalog.length === 0) {
        res.status(400).json({ error: "No past papers with questions found for this subject, level, and paper number." });
        return;
      }

      const statsSummary = buildStatsSummary(catalog);
      const catalogJson = JSON.stringify(catalog, null, 0);

      const userPrompt = [
        `Subject: ${subject}`,
        `Level: ${level}`,
        `Paper number: ${paperNumber}`,
        `Target exam year for prediction label: ${targetYear}`,
        "",
        "Historical tag statistics:",
        statsSummary,
        "",
        "Full question catalog (select ONLY from these):",
        catalogJson,
      ].join("\n");

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://certchamps.com",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4000,
          temperature: 0.4,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("OpenRouter error:", response.status, errText);
        res.status(502).json({ error: "AI request failed", details: errText });
        return;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        res.status(502).json({ error: "Empty AI response" });
        return;
      }

      const parsed = validateSelections(catalog, parseJsonResponse(content));
      parsed.year = targetYear;
      parsed.paperNumber = paperNumber;

      res.json(parsed);
    } catch (err) {
      console.error("generatePredictedPaper error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to generate prediction",
      });
    }
  }
);
