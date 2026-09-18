export type LinkedDiscoverQuestion = {
  id: string;
  name: string;
  practiceUrl?: string;
  subjectId?: string;
  subjectLabel?: string;
  level?: string;
  topic?: string;
  source?: string;
};

export const DISCOVER_SIDEBAR_PARAM = "sidebar";
export const DISCOVER_RESOURCE_PARAM = "discoverResource";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fromLegacy(data: Record<string, unknown>): LinkedDiscoverQuestion | null {
  const id = clean(data.linkedQuestionId);
  const name = clean(data.linkedQuestionName);
  if (!id && !name) return null;
  return {
    id: id || name,
    name: name || id,
    practiceUrl: clean(data.linkedQuestionPracticeUrl) || undefined,
    subjectId: clean(data.linkedQuestionSubjectId) || undefined,
    subjectLabel: clean(data.linkedQuestionSubjectLabel) || undefined,
    level: clean(data.linkedQuestionLevel) || undefined,
    topic: clean(data.linkedQuestionTopic) || undefined,
    source: clean(data.linkedQuestionSource) || undefined,
  };
}

function fromEntry(value: unknown): LinkedDiscoverQuestion | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = clean(row.id ?? row.linkedQuestionId);
  const name = clean(row.name ?? row.linkedQuestionName);
  if (!id && !name) return null;
  return {
    id: id || name,
    name: name || id,
    practiceUrl: clean(row.practiceUrl ?? row.linkedQuestionPracticeUrl) || undefined,
    subjectId: clean(row.subjectId ?? row.linkedQuestionSubjectId) || undefined,
    subjectLabel: clean(row.subjectLabel ?? row.linkedQuestionSubjectLabel) || undefined,
    level: clean(row.level ?? row.linkedQuestionLevel) || undefined,
    topic: clean(row.topic ?? row.linkedQuestionTopic) || undefined,
    source: clean(row.source ?? row.linkedQuestionSource) || undefined,
  };
}

/** Merge `linkedQuestions[]` with the legacy single-question fields. */
export function parseLinkedQuestions(data: Record<string, unknown> | null | undefined): LinkedDiscoverQuestion[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: LinkedDiscoverQuestion[] = [];
  const push = (item: LinkedDiscoverQuestion | null) => {
    if (!item) return;
    const key = item.id || item.practiceUrl || item.name;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  if (Array.isArray(data.linkedQuestions)) {
    for (const entry of data.linkedQuestions) push(fromEntry(entry));
  }
  push(fromLegacy(data));
  return out;
}

export function noteLinksQuestion(
  note: { linkedQuestionId?: string | null; linkedQuestions?: LinkedDiscoverQuestion[] } | null | undefined,
  questionId: string | undefined
): boolean {
  if (!questionId) return false;
  if (note?.linkedQuestionId === questionId) return true;
  return Boolean(note?.linkedQuestions?.some((item) => item.id === questionId));
}

export function withDiscoverSidebar(practiceUrl: string, resourceId: string): string {
  const trimmed = practiceUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed, "https://app.certchamps.ie");
    url.searchParams.set(DISCOVER_SIDEBAR_PARAM, "threads");
    if (resourceId) url.searchParams.set(DISCOVER_RESOURCE_PARAM, resourceId);
    return `${url.pathname}${url.search}`;
  } catch {
    const join = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${join}${DISCOVER_SIDEBAR_PARAM}=threads&${DISCOVER_RESOURCE_PARAM}=${encodeURIComponent(resourceId)}`;
  }
}

export function linkedQuestionsPayload(questions: LinkedDiscoverQuestion[]) {
  const primary = questions[0];
  return {
    linkedQuestions: questions.map((item) => ({
      id: item.id,
      name: item.name,
      practiceUrl: item.practiceUrl ?? null,
      subjectId: item.subjectId ?? null,
      subjectLabel: item.subjectLabel ?? null,
      level: item.level ?? null,
      topic: item.topic ?? null,
      source: item.source ?? null,
    })),
    linkedQuestionId: primary?.id ?? null,
    linkedQuestionName: primary?.name ?? null,
    linkedQuestionPracticeUrl: primary?.practiceUrl ?? null,
    linkedQuestionSubjectId: primary?.subjectId ?? null,
    linkedQuestionSubjectLabel: primary?.subjectLabel ?? null,
    linkedQuestionLevel: primary?.level ?? null,
    linkedQuestionTopic: primary?.topic ?? null,
    linkedQuestionSource: primary?.source ?? null,
  };
}
