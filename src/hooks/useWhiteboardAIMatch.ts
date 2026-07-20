import { useCallback, useMemo, useRef, useState } from "react";
import { useExamPapers, type ExamPaper, type PaperQuestion } from "./useExamPapers";
import {
  groupImageQuestions,
  listLevelsForSubject,
  listMarkingSchemeFilesForTopic,
  listQuestionsForTopic,
  listTopicsForSubjectLevel,
  type GroupedImageQuestion,
  type ImageTopic,
  type MarkingSchemeFile,
} from "./useImageQuestions";
import { getStorageFolderName, getSubjectLabel } from "../data/practiceHubSubjects";
import { buildImageAttachment, buildPaperAttachment } from "../lib/whiteboardAttachments";
import type { AttachedQuestion } from "../data/whiteboards";

const CHAT_API_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/chat";
const MAX_CANDIDATES = 700;
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
  "I couldn't confidently find questions matching that — maybe try rephrasing, or a different topic for this subject?";

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

function buildContext(subjectLabel: string): string {
  return [
    "You are the question-finding assistant inside CertChamps, an Irish exam-prep app.",
    `The student wants a study page of ${subjectLabel} questions from the question bank.`,
    "You will receive the student's free-text request and a JSON list of candidate questions with their metadata (name, topic tags, exam paper, level, year, size).",
    "Act like a person skimming the question bank: reason about what each candidate actually is (its topic, whether it's a short or long question, its level and difficulty cues) rather than doing literal keyword matching against tags.",
    "Interpret loose or informal phrasing generously — infer topic, question type (e.g. 'short questions' usually means fewer pages/parts, early question numbers, or Section A style), difficulty and level cues (like 'higher level', 'ordinary'), and year hints.",
    "Only include questions that genuinely fit. Do not pad the selection with weak matches to reach a bigger count. Prefer a smaller high-quality set (roughly 3-12 questions when plenty match).",
    "",
    "Respond with ONLY a JSON object, no prose, no code fences, in this exact shape:",
    '{"status":"ok"|"low_confidence"|"no_match","pageName":string,"emoji":string,"message":string,"questionIds":string[]}',
    "- status ok: you found a confident set of matches.",
    "- status low_confidence: you found something but you're unsure it's what they meant. Include your best picks anyway.",
    "- status no_match: the request is empty, gibberish, off-topic for this subject, or nothing fits. questionIds must be [].",
    "- pageName: a short friendly title for the study page (max ~40 chars). Empty string when no_match.",
    "- emoji: one single emoji that suits the page topic. Empty string when no_match.",
    "- message: one or two warm, non-judgmental sentences to show the student. For no_match, kindly say you couldn't find matching questions and invite them to rephrase or try another topic — never make them feel they did something wrong. For low_confidence, briefly say what you found and that they can adjust it.",
    `- questionIds: ids of chosen candidates, max ${MAX_SELECTIONS}.`,
  ].join("\n");
}

async function requestCompletion(context: string, userPrompt: string): Promise<string> {
  const res = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: userPrompt }],
      context,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error("AI request failed");
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
      message: typeof parsed.message === "string" ? parsed.message : "",
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
export function useWhiteboardAIMatch(subject: string | null) {
  const [state, setState] = useState<AIMatchState>({ status: "idle" });
  const { papers, loading: papersLoading, getPaperQuestions } = useExamPapers(subject);
  const runIdRef = useRef(0);

  const papersRef = useRef(papers);
  papersRef.current = papers;
  const papersLoadingRef = useRef(papersLoading);
  papersLoadingRef.current = papersLoading;

  const storageFolder = useMemo(() => (subject ? getStorageFolderName(subject) : null), [subject]);

  const gatherCandidates = useCallback(async (): Promise<Candidate[]> => {
    // Wait for the subject's paper list if the user submitted straight away.
    const waitUntil = Date.now() + 15_000;
    while (papersLoadingRef.current && Date.now() < waitUntil) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const currentPapers = papersRef.current;

    // Paper subjects: pull every question of every paper for the subject (tags/subject
    // narrow the pool; the model judges the actual questions).
    if (currentPapers.length > 0) {
      const perPaper = await Promise.all(
        currentPapers.map(async (paper) => {
          try {
            const questions = await getPaperQuestions(paper);
            return questions.map<Candidate>((question) => ({ kind: "paper", paper, question }));
          } catch {
            return [] as Candidate[];
          }
        })
      );
      return perPaper.flat().slice(0, MAX_CANDIDATES);
    }

    // Image subjects: list grouped questions per topic across available levels.
    if (!storageFolder) return [];
    let levels: string[] = [];
    try {
      levels = await listLevelsForSubject(storageFolder);
    } catch {
      return [];
    }
    const candidates: Candidate[] = [];
    for (const level of levels) {
      let topics: ImageTopic[] = [];
      try {
        topics = await listTopicsForSubjectLevel(storageFolder, level);
      } catch {
        continue;
      }
      const perTopic = await Promise.all(
        topics.map(async (topic) => {
          try {
            const questions = await listQuestionsForTopic(storageFolder, level, topic.name);
            return groupImageQuestions(questions).map<Candidate>((grouped) => ({
              kind: "image",
              storageSubject: storageFolder,
              level,
              topic,
              grouped,
            }));
          } catch {
            return [] as Candidate[];
          }
        })
      );
      perTopic.forEach((list) => candidates.push(...list));
      if (candidates.length >= MAX_CANDIDATES) break;
    }
    return candidates.slice(0, MAX_CANDIDATES);
  }, [getPaperQuestions, storageFolder]);

  const buildAttachments = useCallback(async (selected: Candidate[]): Promise<AttachedQuestion[]> => {
    const msFilesByTopic = new Map<string, MarkingSchemeFile[]>();
    const imageTopics = selected.filter((c): c is ImageCandidate => c.kind === "image");
    await Promise.all(
      Array.from(new Set(imageTopics.map((c) => `${c.storageSubject}\0${c.level}\0${c.topic.name}`))).map(
        async (key) => {
          const [sub, level, topic] = key.split("\0");
          try {
            msFilesByTopic.set(key, await listMarkingSchemeFilesForTopic(sub, level, topic));
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
    async (prompt: string): Promise<AIProposal | null> => {
      const trimmed = prompt.trim();
      if (!subject || !trimmed) return null;
      const runId = ++runIdRef.current;
      setState({ status: "searching" });

      try {
        const candidates = await gatherCandidates();
        if (runId !== runIdRef.current) return null;

        if (candidates.length === 0) {
          setState({
            status: "message",
            message:
              "There aren't any bank questions for this subject yet — you can still create a page and upload your own.",
          });
          return null;
        }

        const descriptors = candidates.map((candidate, i) => candidateDescriptor(candidate, `q${i}`));
        const subjectLabel = getSubjectLabel(subject);
        const userPrompt = [
          `Student request: "${trimmed}"`,
          "",
          `Candidate questions (${descriptors.length}):`,
          JSON.stringify(descriptors),
        ].join("\n");

        const raw = await requestCompletion(buildContext(subjectLabel), userPrompt);
        if (runId !== runIdRef.current) return null;

        const reply = parseModelReply(raw);
        if (!reply) {
          setState({ status: "message", message: FRIENDLY_NO_MATCH });
          return null;
        }

        const byId = new Map(candidates.map((candidate, i) => [`q${i}`, candidate]));
        const selected = reply.questionIds
          .map((id) => byId.get(id))
          .filter((c): c is Candidate => Boolean(c))
          .slice(0, MAX_SELECTIONS);

        if (reply.status === "no_match" || selected.length === 0) {
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
              "I found a few questions that might fit — have a look and see if they're what you meant.",
            proposal,
          });
          return null;
        }

        setState({ status: "idle" });
        return proposal;
      } catch (err) {
        console.error("[useWhiteboardAIMatch] search failed:", err);
        if (runId === runIdRef.current) {
          setState({
            status: "message",
            message: "Something went wrong on my end while searching — give it another try in a moment.",
          });
        }
        return null;
      }
    },
    [subject, gatherCandidates, buildAttachments]
  );

  const dismiss = useCallback(() => {
    runIdRef.current += 1;
    setState({ status: "idle" });
  }, []);

  return { state, search, dismiss };
}
