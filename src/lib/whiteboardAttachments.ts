import type { ExamPaper, PaperQuestion } from "../hooks/useExamPapers";
import {
  getMarkingSchemeFilesForGroupedQuestion,
  type GroupedImageQuestion,
  type ImageTopic,
  type MarkingSchemeFile,
} from "../hooks/useImageQuestions";
import { newAttachmentId, type AttachedQuestion } from "../data/whiteboards";

/** Attachment for a past-paper bank question (snapshot of everything needed to render it). */
export function buildPaperAttachment(paper: ExamPaper, question: PaperQuestion): AttachedQuestion {
  return {
    id: newAttachmentId(),
    source: "bank",
    label: `${question.questionName} — ${paper.label}`,
    bank: {
      kind: "paper",
      subject: paper.subject ?? "maths",
      level: paper.level ?? "higher",
      paperId: paper.id,
      questionId: question.id,
      paperStoragePath: question.sourceStoragePath?.trim() || paper.storagePath,
      year: question.sourceYear ?? paper.year,
      pageRange: question.pageRange,
      pageRegions: question.pageRegions,
      markingSchemePageRange: question.markingSchemePageRange ?? null,
    },
  };
}

/** Attachment for an image-bank question (subjects without paper PDFs). */
export function buildImageAttachment(
  storageSubject: string,
  level: string,
  topic: ImageTopic,
  grouped: GroupedImageQuestion,
  msFiles: MarkingSchemeFile[]
): AttachedQuestion {
  const matchedMs = getMarkingSchemeFilesForGroupedQuestion(msFiles, grouped);
  return {
    id: newAttachmentId(),
    source: "bank",
    label: `${grouped.displayName} — ${topic.displayName}`,
    bank: {
      kind: "image",
      subject: storageSubject,
      level,
      topic: topic.name,
      groupKey: grouped.key,
      imagePaths: grouped.images.map((img) => img.storagePath),
      markingSchemePaths: matchedMs.map((f) => f.storagePath),
    },
  };
}
