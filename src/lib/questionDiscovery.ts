import { getPracticeSubjectId, getSubjectLabel } from "../data/practiceHubSubjects";

export type QuestionDiscoveryContext = {
  id: string;
  name: string;
  subjectId?: string;
  subjectLabel?: string;
  level?: string;
  topic?: string;
  practiceUrl?: string;
  source?: "practice" | "whiteboard";
};

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

type QuestionLike = Record<string, unknown> & {
  properties?: { name?: unknown; topic?: unknown };
};

export function getQuestionDiscoveryContext(value: unknown): QuestionDiscoveryContext | null {
  if (!value || typeof value !== "object") return null;
  const question = value as QuestionLike;

  const rawSubject = clean(question._discoverSubjectId ?? question.subject);
  const subjectId = rawSubject ? getPracticeSubjectId(rawSubject) : undefined;
  const subjectLabel = clean(question._discoverSubjectLabel) ??
    (rawSubject ? getSubjectLabel(rawSubject) : undefined);
  const name = clean(question._discoverName ?? question.questionName ?? question.properties?.name) ??
    "Practice question";
  const id = clean(question._discoverId ?? question.id);
  if (!id) return null;

  return {
    id,
    name,
    subjectId,
    subjectLabel,
    level: clean(question._discoverLevel ?? question.level),
    topic: clean(question._discoverTopic ?? question.topic),
    practiceUrl: clean(question._practiceUrl),
    source: question._discoverSource === "whiteboard" ? "whiteboard" : "practice",
  };
}

export function buildDiscoverQuestionUrl(
  context: QuestionDiscoveryContext,
  options: { share?: boolean } = {}
): string {
  const params = new URLSearchParams({
    questionId: context.id,
    questionName: context.name,
  });
  if (context.subjectId) params.set("subject", context.subjectId);
  if (context.subjectLabel) params.set("subjectLabel", context.subjectLabel);
  if (context.level) params.set("level", context.level);
  if (context.topic) params.set("topic", context.topic);
  if (context.practiceUrl) params.set("practiceUrl", context.practiceUrl);
  if (context.source) params.set("source", context.source);
  if (options.share) params.set("share", "1");
  return `/discover?${params.toString()}`;
}
