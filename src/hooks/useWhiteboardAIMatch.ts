import { listCatalogueQuestions, type CatalogueQuestion } from "../lib/firestoreImageCatalogue";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExamPapers, type ExamPaper, type PaperQuestion } from "./useExamPapers";
import {
  groupImageQuestions,
  listLevelsForSubject,
  listMarkingSchemeFilesForTopic,
  type ImageQuestion,
  type GroupedImageQuestion,
  type ImageTopic,
  type MarkingSchemeFile,
} from "./useImageQuestions";
import { getPracticeSubjectId, getStorageFolderName, getSubjectLabel } from "../data/practiceHubSubjects";
import { buildImageAttachment, buildPaperAttachment } from "../lib/whiteboardAttachments";
import type { AttachedQuestion } from "../data/whiteboards";
import { AiRequestError, aiResponseError, authenticatedAiFetch, METERED_CHAT_API_URL } from "../lib/aiApi";
const MAX_CANDIDATES = 120;
const MAX_SELECTIONS = 20;

export type AIProposal = {
  pageName: string;
  emoji: string | null;
  attachments: AttachedQuestion[];
};

export type AIMatchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "message"; message: string }
  | { status: "low_confidence"; message: string; proposal: AIProposal };

type PaperCandidate = {
  kind: "paper";
  paper: ExamPaper;
  question: PaperQuestion;
};

type ImageCandidate = {
  kind: "image";
  storageSubject: string;
  level: string;
  topic: ImageTopic;
  grouped: GroupedImageQuestion;
};

type Candidate = PaperCandidate | ImageCandidate;

const FRIENDLY_NO_MATCH =
  "I couldn't confidently find questions matching that, maybe try rephrasing, or a different topic for this subject?";

async function within<T>(promise: Promise<T>, milliseconds: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>(resolve => {
      timer = setTimeout(() => resolve(fallback), milliseconds);
    })]);
  } catch { return fallback; }
  finally { clearTimeout(timer); }
}

async function loadWithin<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Question catalogue loading timed out. Please retry.")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function matchWords(text: string): string[] {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
}

function rankCandidates(catalogue: Candidate[], prompt: string, subjectLabel: string): { candidates: Candidate[]; fallback: Candidate[]; exact: Candidate[] } {
  const stopWords = new Set(matchWords("give me some a an the of on in for with and or please want need practice questions question paper papers topic topics help study revise revision set make create whiteboard document all any random test quiz mix mixed selection"));
  for (const word of matchWords(subjectLabel)) stopWords.add(word);
  const requestedLevel = /\b(higher|hl)\b/i.test(prompt) ? "higher" : /\b(ordinary|ol)\b/i.test(prompt) ? "ordinary" : /\b(foundation|fl)\b/i.test(prompt) ? "foundation" : null;
  for (const word of ["higher", "ordinary", "foundation", "level", "hl", "ol", "fl"]) stopWords.add(word);
  const aliases: Record<string, string> = { differentiation: "derivative", derivatives: "derivative", differentiate: "derivative", integration: "integral", integrate: "integral", integrals: "integral", quadratic: "quadratic", quadratics: "quadratic", functions: "function", equations: "equation", poems: "poetry", poem: "poetry" };
  const normalize = (word: string) => aliases[word] ?? (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word);
  const keywords = [...new Set(matchWords(prompt).filter(word => !stopWords.has(word) && (!/^\d+$/.test(word) || /^\d{4}$/.test(word))).map(normalize))];
  const ranked = catalogue.filter(candidate => !requestedLevel || matchWords(String(candidate.kind === "paper" ? candidate.paper.level : candidate.level)).includes(requestedLevel))
    .map((candidate, index) => {
      const descriptor = candidateDescriptor(candidate, "");
      const words = new Set(matchWords(Object.values(descriptor).flat().join(" ")).map(normalize));
      const size = candidate.kind === "image" ? candidate.grouped.images.length : candidate.question.pageRange ? candidate.question.pageRange[1] - candidate.question.pageRange[0] + 1 : null;
      if (size != null && size <= 2) words.add("short");
      if (size != null && size >= 3) words.add("long");
      const hits = keywords.filter(word => words.has(word)).length;
      return { candidate, index, hits };
    }).sort((a, b) => b.hits - a.hits || a.index - b.index);
  // A fallback needs actual topic overlap, or a wholly generic study request.
  // Unknown/off-subject requests never receive arbitrary bank questions.
  const fallback = ranked.filter(item => keywords.length === 0 || item.hits >= Math.max(1, Math.ceil(keywords.length / 2)))
    .slice(0, 6).map(item => item.candidate);
  const preferred = ranked.filter(item => item.hits > 0).slice(0, MAX_CANDIDATES / 2).map(item => item.candidate);
  const candidates: Candidate[] = [...preferred];
  const included = new Set(preferred);
  const groups = new Map<string, Candidate[]>();
  for (const item of ranked) {
    if (included.has(item.candidate)) continue;
    const key = item.candidate.kind === "paper" ? `${item.candidate.paper.level}:${item.candidate.paper.id}` : `${item.candidate.level}:${item.candidate.topic.name}`;
    const group = groups.get(key) ?? [];
    group.push(item.candidate); groups.set(key, group);
  }
  // Round-robin the ranked groups so early papers/topics cannot crowd out others.
  while (candidates.length < MAX_CANDIDATES && groups.size) {
    for (const [key, group] of groups) {
      const candidate = group.shift();
      if (candidate) candidates.push(candidate);
      if (!group.length) groups.delete(key);
      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }
  const exact = keywords.length >= 2 ? ranked.filter(item => item.hits === keywords.length).slice(0, 12).map(item => item.candidate) : [];
  return { candidates, fallback, exact };
}

function catalogueCandidates(rows: CatalogueQuestion[], storageSubject: string, level: string): ImageCandidate[] {
  const topics = new Map<string, ImageQuestion[]>();
  for (const row of rows) {
    const images = topics.get(row.topic) ?? [];
    images.push({
      name: row.fileName, displayName: row.questionName, storagePath: row.imagePath,
      downloadUrl: "", year: row.year, paper: row.paper, paperType: row.paperType,
      topic: row.topic, catalogueId: row.id, markingSchemePaths: row.markingSchemePaths,
      audioPath: row.audioPath, audioStartSec: row.audioStartSec, audioEndSec: row.audioEndSec,
      audioStartLabel: row.audioStartLabel,
    });
    topics.set(row.topic, images);
  }
  return [...topics].flatMap(([name, images]) => groupImageQuestions(images).map(grouped => ({
    kind: "image" as const, storageSubject, level, grouped,
    topic: { name, displayName: name.replace(/[_-]+/g, " "), path: name, questionCount: images.length, thumbnailUrl: null },
  })));
}

function candidateDescriptor(candidate: Candidate, id: string): Record<string, unknown> {
  if (candidate.kind === "paper") {
    const { paper, question } = candidate;
    return {
      id,
      name: question.questionName,
      tags: question.tags ?? [],
      paper: paper.label,
      level: paper.level,
      year: question.sourceYear ?? paper.year,
      pages: question.pageRange ? question.pageRange[1] - question.pageRange[0] + 1 : undefined,
    };
  }
  return {
    id,
    name: candidate.grouped.displayName,
    topic: candidate.topic.displayName,
    level: candidate.level,
    parts: candidate.grouped.images.length,
  };
}

type AIPageType = "whiteboard" | "document";

function buildContext(subjectLabel: string, pageType: AIPageType): string {
  const destination = pageType === "document" ? "document" : "whiteboard";
  return [
    "You are the question-finding assistant inside CertChamps, an Irish exam-prep app.",
    `The student wants a ${destination} of ${subjectLabel} questions from the question bank.`,
    "You will receive the student's free-text request and a JSON list of candidate questions with their metadata (name, topic tags, exam paper, level, year, size).",
    "Act like a person skimming the question bank: reason about what each candidate actually is (its topic, whether it's a short or long question, its level and difficulty cues) rather than doing literal keyword matching against tags.",
    "Interpret loose or informal phrasing generously, infer topic, question type (e.g. 'short questions' usually means fewer pages/parts, early question numbers, or Section A style), difficulty and level cues (like 'higher level', 'ordinary'), and year hints.",
    "Try to return a useful selection for any relevant study request. If the exact request is too narrow, offer the closest related questions with status low_confidence and explain the difference. Never substitute an unrelated topic or ignore an explicitly requested level.",
    "Only include questions that genuinely fit. Do not pad the selection with weak matches to reach a bigger count. Prefer a smaller high-quality set (roughly 3-12 questions when plenty match).",
    "",
    "Respond with ONLY a JSON object, no prose, no code fences, in this exact shape:",
    '{"status":"ok"|"low_confidence"|"no_match","pageName":string,"emoji":string,"message":string,"questionIds":string[]}',
    "- status ok: you found a confident set of matches.",
    "- status low_confidence: you found something but you're unsure it's what they meant. Include your best picks anyway.",
    "- status no_match: the request is empty, gibberish, off-topic for this subject, or nothing fits. questionIds must be [].",
    `- pageName: a short friendly title for the ${destination} (max ~40 chars). Empty string when no_match.`,
    "- emoji: one single emoji that suits the page topic. Empty string when no_match.",
    "- message: Do not use em dashes or en dashes. Write one or two warm, non-judgmental sentences to show the student. For no_match, kindly say you couldn't find matching questions and invite them to rephrase or try another topic, never make them feel they did something wrong. For low_confidence, briefly say what you found and that they can adjust it.",
    `- questionIds: ids of chosen candidates, max ${MAX_SELECTIONS}.`,
  ].join("\n");
}

async function requestCompletion(context: string, userPrompt: string, subject: string, signal: AbortSignal): Promise<string> {
  const res = await authenticatedAiFetch(METERED_CHAT_API_URL, {
      messages: [{ role: "user", content: userPrompt }],
      context,
      temperature: 0.2,
      subject,
    }, "whiteboard", undefined, { signal });
  if (!res.ok) throw await aiResponseError(res, "AI request failed");
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
        };
        if (parsed.error) throw new Error(parsed.error.message || "Stream error");
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) fullText += content;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (buffer.trim().startsWith("data: ")) {
    const data = buffer.trim().slice(6);
    if (data !== "[DONE]") {
      const parsed = JSON.parse(data);
      if (parsed.error) throw new Error(parsed.error.message || "Stream error");
      fullText += parsed.choices?.[0]?.delta?.content ?? "";
    }
  }
  return fullText;
}

type ModelReply = {
  status: "ok" | "low_confidence" | "no_match";
  pageName: string;
  emoji: string;
  message: string;
  questionIds: string[];
};

function parseModelReply(raw: string): ModelReply | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ModelReply>;
    const status =
      parsed.status === "ok" || parsed.status === "low_confidence" || parsed.status === "no_match"
        ? parsed.status
        : null;
    if (!status) return null;
    return {
      status,
      pageName: typeof parsed.pageName === "string" ? parsed.pageName : "",
      emoji: typeof parsed.emoji === "string" ? parsed.emoji : "",
      message: typeof parsed.message === "string" ? parsed.message.replace(/\s*[—–]\s*/g, ", ") : "",
      questionIds: Array.isArray(parsed.questionIds)
        ? parsed.questionIds.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Powers the Whiteboards landing AI bar: interprets a free-text prompt within
 * the selected subject, picks matching bank questions (content-first via the
 * chat model, tags only narrow the pool), and hands back a page proposal.
 */
export function useWhiteboardAIMatch(subject: string | null, onPageLimit?: () => void) {
  const [state, setState] = useState<AIMatchState>({ status: "idle" });
  const { papers, loading: papersLoading, getPaperQuestions } = useExamPapers(subject);
  const runIdRef = useRef(0);

  const papersRef = useRef(papers);
  papersRef.current = papers;
  const papersLoadingRef = useRef(papersLoading);
  papersLoadingRef.current = papersLoading;

  const storageFolder = useMemo(() => (subject ? getStorageFolderName(subject) : null), [subject]);

  const candidateCacheRef = useRef(new Map<string, Candidate[]>());
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    setState({ status: "idle" });
    return () => { runIdRef.current += 1; controllerRef.current?.abort(); };
  }, [subject]);

  const gatherCandidates = useCallback(async (): Promise<Candidate[]> => {
    if (!subject) return [];
    const cached = candidateCacheRef.current.get(subject);
    if (cached?.length) return cached;
    const candidates: Candidate[] = [];
    // Load both catalogues. Empty/broken paper banks must not hide image topics.
    const loadPapers = async () => {
      const waitUntil = Date.now() + 2500;
      while (papersLoadingRef.current && Date.now() < waitUntil) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const results = await Promise.allSettled(papersRef.current.filter(paper => getPracticeSubjectId(paper.subject ?? "") === getPracticeSubjectId(subject)).map(async paper => {
        const questions = await loadWithin(getPaperQuestions(paper), 6000);
        candidates.push(...questions.map<PaperCandidate>(question => ({ kind: "paper", paper, question })));
      }));
      if (results.some(result => result.status === "rejected")) throw new Error("Some paper questions could not be loaded.");
    };
    const loadImages = async () => {
      if (!storageFolder) return;
      const levels = await loadWithin(listLevelsForSubject(storageFolder), 8000);
      const results = await Promise.allSettled(levels.map(async level => {
        // Matching needs paths and metadata, not a Storage URL per image.
        // Read each level once rather than issuing a full query per topic.
        const rows = await loadWithin(listCatalogueQuestions(storageFolder, level), 12_000);
        candidates.push(...catalogueCandidates(rows, storageFolder, level));
      }));
      if (results.some(result => result.status === "rejected")) throw new Error("Some image question levels could not be loaded.");
    };
    const results = await Promise.allSettled([loadPapers(), loadImages()]);
    const complete = results.every(result => result.status === "fulfilled");
    if (!candidates.length && !complete) throw new Error("Could not load this subject’s question bank. Please retry.");
    // Never cache a partial bank as complete after a timeout or permission error.
    if (candidates.length && complete) candidateCacheRef.current.set(subject, candidates);
    return candidates;
  }, [subject, getPaperQuestions, storageFolder]);

  const buildAttachments = useCallback(async (selected: Candidate[]): Promise<AttachedQuestion[]> => {
    const msFilesByTopic = new Map<string, MarkingSchemeFile[]>();
    const imageTopics = selected.filter((c): c is ImageCandidate => c.kind === "image" && !c.grouped.markingSchemePaths?.length);
    await Promise.all(
      Array.from(new Set(imageTopics.map((c) => `${c.storageSubject}\0${c.level}\0${c.topic.name}`))).map(
        async (key) => {
          const [sub, level, topic] = key.split("\0");
          try {
            msFilesByTopic.set(key, await within(listMarkingSchemeFilesForTopic(sub, level, topic), 2000, []));
          } catch {
            msFilesByTopic.set(key, []);
          }
        }
      )
    );
    return selected.map((candidate) => {
      if (candidate.kind === "paper") {
        return buildPaperAttachment(candidate.paper, candidate.question);
      }
      const key = `${candidate.storageSubject}\0${candidate.level}\0${candidate.topic.name}`;
      return buildImageAttachment(
        candidate.storageSubject,
        candidate.level,
        candidate.topic,
        candidate.grouped,
        msFilesByTopic.get(key) ?? []
      );
    });
  }, []);

  const search = useCallback(
    async (prompt: string, pageType: AIPageType = "whiteboard"): Promise<AIProposal | null> => {
      const trimmed = prompt.trim();
      if (!subject || !trimmed) return null;
      const runId = ++runIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      let fallbackCandidates: Candidate[] = [];
      setState({ status: "searching" });

      try {
        const catalogue = await gatherCandidates();
        const ranked = rankCandidates(catalogue, trimmed, getSubjectLabel(subject));
        const candidates = ranked.candidates;
        fallbackCandidates = ranked.fallback;
        if (runId !== runIdRef.current) return null;

        if (candidates.length === 0) {
          setState({
            status: "message",
            message:
              "I couldn’t load a suitable set of questions. Try another topic or level, or browse the question bank.",
          });
          return null;
        }

        // Named requests with complete metadata overlap do not need an AI round trip.
        if (ranked.exact.length) {
          const attachments = await buildAttachments(ranked.exact);
          if (runId !== runIdRef.current) return null;
          setState({ status: "idle" });
          return { pageName: trimmed.slice(0, 40), emoji: null, attachments };
        }

        const descriptors = candidates.map((candidate, i) => candidateDescriptor(candidate, `q${i}`));
        const subjectLabel = getSubjectLabel(subject);
        const userPrompt = [
          `Student request: "${trimmed}"`,
          "",
          `Candidate questions (${descriptors.length}):`,
          JSON.stringify(descriptors),
        ].join("\n");

        const timeout = setTimeout(() => controller.abort(), 15_000);
        let raw: string;
        try {
          raw = await requestCompletion(buildContext(subjectLabel, pageType), userPrompt, subject, controller.signal);
        } finally { clearTimeout(timeout); }
        if (runId !== runIdRef.current) return null;

        const reply = parseModelReply(raw);
        if (!reply) {
          throw new Error("The matching response was incomplete.");
        }

        const byId = new Map(candidates.map((candidate, i) => [`q${i}`, candidate]));
        const selected = [...new Set(reply.questionIds)]
          .map((id) => byId.get(id))
          .filter((c): c is Candidate => Boolean(c))
          .slice(0, MAX_SELECTIONS);

        if (selected.length === 0 && reply.status !== "no_match") throw new Error("No valid question IDs returned.");
        if (reply.status === "no_match") {
          setState({ status: "message", message: reply.message || FRIENDLY_NO_MATCH });
          return null;
        }

        const attachments = await buildAttachments(selected);
        if (runId !== runIdRef.current) return null;

        const proposal: AIProposal = {
          pageName: reply.pageName.trim() || trimmed.slice(0, 40),
          emoji: reply.emoji.trim() ? Array.from(reply.emoji.trim())[0] : null,
          attachments,
        };

        if (reply.status === "low_confidence") {
          setState({
            status: "low_confidence",
            message:
              reply.message ||
              "I found a few questions that might fit, have a look and see if they're what you meant.",
            proposal,
          });
          return null;
        }

        setState({ status: "idle" });
        return proposal;
      } catch (err) {
        if (err instanceof AiRequestError && err.code === "WHITEBOARD_LIMIT") {
          if (runId === runIdRef.current) {
            setState({ status: "idle" });
            onPageLimit?.();
          }
          return null;
        }
        if (runId !== runIdRef.current) return null;
        if (!(err instanceof AiRequestError && err.code !== "AI_REQUEST_FAILED") && fallbackCandidates.length) {
          const attachments = await buildAttachments(fallbackCandidates);
          if (runId !== runIdRef.current) return null;
          setState({ status: "low_confidence", message: "AI matching is taking longer than expected. These questions match your request, have a look before creating your page.", proposal: {
            pageName: trimmed.slice(0, 40), emoji: null, attachments,
          } });
          return null;
        }
        console.error("[useWhiteboardAIMatch] search failed:", err);
        if (runId === runIdRef.current) {
          setState({
            status: "message",
            message: "Matching couldn’t finish this time. Please try again, or make your request more specific.",
          });
        }
        return null;
      }
    },
    [subject, gatherCandidates, buildAttachments, onPageLimit]
  );

  const dismiss = useCallback(() => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, search, dismiss };
}
