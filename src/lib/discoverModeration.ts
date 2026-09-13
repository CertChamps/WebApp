import {
  groupImageQuestions,
  listQuestionsForTopic,
  type GroupedImageQuestion,
} from "../hooks/useImageQuestions";
import {
  getPracticeSubjectId,
  getStorageFolderName,
} from "../data/practiceHubSubjects";
import { parseExamCycle, type ExamCycleId } from "./examCycle";
import {
  parseLinkedQuestions,
  type LinkedDiscoverQuestion,
} from "./discoverLinks";

export type ResourceType = "Notes" | "Videos" | "Sample Answers" | "Flashcards" | "Website" | "Other";
export type ResourceLevel = "Higher" | "Ordinary" | "Foundation";
export type ResourceSource = "website" | "pdf";

export const RESOURCE_TYPES: ResourceType[] = [
  "Notes",
  "Videos",
  "Sample Answers",
  "Flashcards",
  "Website",
  "Other",
];
export const RESOURCE_LEVELS: ResourceLevel[] = ["Higher", "Ordinary", "Foundation"];
export const MAX_TITLE = 80;
export const MAX_DESCRIPTION = 240;

export type DiscoverModerationNote = {
  id: string;
  userId: string;
  username: string;
  userPicture: string | null;
  title: string;
  description: string;
  websiteUrl: string;
  resourceSource: ResourceSource;
  pdfPath: string;
  pdfFileName: string;
  thumbnailUrl: string;
  thumbnailPath: string;
  uploadedThumbnailUrl: string;
  uploadedThumbnailPath: string;
  thumbnailStatus: string;
  moderationStatus: string;
  faviconUrl: string;
  siteName: string;
  subjectId: string;
  subjectLabel: string;
  levels: ResourceLevel[];
  resourceType: ResourceType;
  resourceTypes: ResourceType[];
  topics: string[];
  linkedQuestionId: string;
  linkedQuestionName: string;
  linkedQuestionPracticeUrl: string;
  linkedQuestionSubjectId: string;
  linkedQuestionSubjectLabel: string;
  linkedQuestionLevel: string;
  linkedQuestionTopic: string;
  linkedQuestionSource: string;
  linkedQuestions: LinkedDiscoverQuestion[];
  sourceScore: number | null;
  timestamp: number | null;
};

export type LinkedQuestionPreview = {
  displayName: string;
  topic?: string;
  level?: string;
  year?: number;
  paper?: number;
  practiceUrl?: string;
  images: { src: string; alt: string; key?: string }[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asLevel(value: unknown): ResourceLevel | null {
  return typeof value === "string" && RESOURCE_LEVELS.includes(value as ResourceLevel)
    ? (value as ResourceLevel)
    : null;
}

function asType(value: unknown): ResourceType | null {
  return typeof value === "string" && RESOURCE_TYPES.includes(value as ResourceType)
    ? (value as ResourceType)
    : null;
}

export function parseDiscoverModerationNote(
  id: string,
  data: Record<string, unknown>
): DiscoverModerationNote {
  const levels = Array.isArray(data.levels)
    ? data.levels.map(asLevel).filter((level): level is ResourceLevel => Boolean(level))
    : [];
  const fallbackLevel = asLevel(data.level);
  const types = Array.isArray(data.resourceTypes)
    ? data.resourceTypes.map(asType).filter((type): type is ResourceType => Boolean(type))
    : [];
  const fallbackType = asType(data.resourceType);
  const timestamp = data.timestamp as { seconds?: number } | null | undefined;

  return {
    id,
    userId: asString(data.userId),
    username: asString(data.username) || "Unknown",
    userPicture: asString(data.userPicture) || null,
    title: asString(data.title) || "Untitled",
    description: asString(data.description),
    websiteUrl: asString(data.websiteUrl),
    resourceSource: data.resourceSource === "pdf" ? "pdf" : "website",
    pdfPath: asString(data.pdfPath),
    pdfFileName: asString(data.pdfFileName),
    thumbnailUrl: asString(data.thumbnailUrl),
    thumbnailPath: asString(data.thumbnailPath),
    uploadedThumbnailUrl: asString(data.uploadedThumbnailUrl),
    uploadedThumbnailPath: asString(data.uploadedThumbnailPath),
    thumbnailStatus: asString(data.thumbnailStatus) || "none",
    moderationStatus: asString(data.moderationStatus) || "pending",
    faviconUrl: asString(data.faviconUrl),
    siteName: asString(data.siteName),
    subjectId: asString(data.subjectId),
    subjectLabel: asString(data.subjectLabel) || "General",
    levels: [...new Set([...levels, ...(fallbackLevel ? [fallbackLevel] : [])])],
    resourceType: fallbackType ?? types[0] ?? "Notes",
    resourceTypes: [...new Set([...types, ...(fallbackType ? [fallbackType] : [])])],
    topics: Array.isArray(data.topics)
      ? data.topics.filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0)
      : [],
    linkedQuestionId: asString(data.linkedQuestionId),
    linkedQuestionName: asString(data.linkedQuestionName),
    linkedQuestionPracticeUrl: asString(data.linkedQuestionPracticeUrl),
    linkedQuestionSubjectId: asString(data.linkedQuestionSubjectId),
    linkedQuestionSubjectLabel: asString(data.linkedQuestionSubjectLabel),
    linkedQuestionLevel: asString(data.linkedQuestionLevel),
    linkedQuestionTopic: asString(data.linkedQuestionTopic),
    linkedQuestionSource: asString(data.linkedQuestionSource),
    linkedQuestions: parseLinkedQuestions(data),
    sourceScore: typeof data.sourceScore === "number" ? data.sourceScore : null,
    timestamp: typeof timestamp?.seconds === "number" ? timestamp.seconds : null,
  };
}

export function parsePracticeLink(url: string | undefined | null): {
  subject: string;
  level: string;
  topic: string;
  question: string;
  cycle: ExamCycleId;
} | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "https://app.certchamps.ie");
    return {
      subject: parsed.searchParams.get("subject")?.trim() || "",
      level: parsed.searchParams.get("level")?.trim() || "",
      topic: parsed.searchParams.get("topic")?.trim() || "",
      question: parsed.searchParams.get("question")?.trim() || "",
      cycle: parseExamCycle(parsed.searchParams.get("cycle")),
    };
  } catch {
    return null;
  }
}

function questionKeyFromId(
  linkedQuestionId: string,
  subject: string,
  level: string,
  topic: string
): string {
  if (!linkedQuestionId) return "";
  const practiceId = getPracticeSubjectId(subject || linkedQuestionId);
  const candidates = [
    getStorageFolderName(practiceId),
    practiceId,
    subject,
  ].filter(Boolean);
  for (const subjectId of candidates) {
    const prefix = `image_${subjectId}_${level}_${topic}_`;
    if (linkedQuestionId.startsWith(prefix)) {
      return linkedQuestionId.slice(prefix.length);
    }
  }
  return "";
}

function pickGroupedQuestion(
  grouped: GroupedImageQuestion[],
  key: string,
  linkedQuestionId: string,
  linkedQuestionName: string
): GroupedImageQuestion | undefined {
  return (
    grouped.find((item) => item.key === key) ||
    grouped.find((item) => linkedQuestionId.endsWith(`_${item.key}`)) ||
    grouped.find((item) => item.displayName === linkedQuestionName)
  );
}

export async function loadLinkedQuestionPreview(note: {
  linkedQuestionId?: string;
  linkedQuestionName?: string;
  linkedQuestionPracticeUrl?: string;
  linkedQuestionSubjectId?: string;
  linkedQuestionLevel?: string;
  linkedQuestionTopic?: string;
}): Promise<LinkedQuestionPreview | null> {
  const hasLink = Boolean(
    note.linkedQuestionId || note.linkedQuestionPracticeUrl || note.linkedQuestionName
  );
  if (!hasLink) return null;

  const practice = parsePracticeLink(note.linkedQuestionPracticeUrl);
  const subject = practice?.subject || note.linkedQuestionSubjectId || "";
  const level = practice?.level || note.linkedQuestionLevel || "";
  const topic = practice?.topic || note.linkedQuestionTopic || "";
  const cycle = practice?.cycle ?? "leaving";
  const key =
    practice?.question ||
    questionKeyFromId(note.linkedQuestionId || "", subject, level, topic);

  if (!subject || !level || !topic) {
    return {
      displayName: note.linkedQuestionName || key || "Linked question",
      topic: topic || undefined,
      level: level || undefined,
      practiceUrl: note.linkedQuestionPracticeUrl || undefined,
      images: [],
    };
  }

  try {
    const flat = await listQuestionsForTopic(subject, level, topic, cycle);
    const grouped = groupImageQuestions(flat);
    const match = pickGroupedQuestion(
      grouped,
      key,
      note.linkedQuestionId || "",
      note.linkedQuestionName || ""
    );
    if (!match) {
      return {
        displayName: note.linkedQuestionName || key || "Linked question",
        topic,
        level,
        practiceUrl: note.linkedQuestionPracticeUrl || undefined,
        images: [],
      };
    }
    return {
      displayName: match.displayName,
      topic: match.topic || topic,
      level,
      year: match.year,
      paper: match.paper,
      practiceUrl: note.linkedQuestionPracticeUrl || undefined,
      images: match.images.map((image) => ({
        src: image.downloadUrl,
        alt: image.displayName,
        key: image.storagePath,
      })),
    };
  } catch (error) {
    console.warn("Failed to load linked question preview:", error);
    return {
      displayName: note.linkedQuestionName || key || "Linked question",
      topic,
      level,
      practiceUrl: note.linkedQuestionPracticeUrl || undefined,
      images: [],
    };
  }
}

export function timeAgo(seconds: number | null): string {
  if (!seconds) return "";
  const diff = Math.floor(Date.now() / 1000 - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
