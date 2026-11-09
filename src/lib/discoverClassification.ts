import { isDiscoverVideoUrl } from "./discoverMedia";

export const RESOURCE_TYPES = ["Revision Notes", "Sample Answer", "Lesson", "Flashcards"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ResourceFormat = "Document" | "Image" | "Website" | "Video";

export function normaliseResourceType(value: unknown): ResourceType | null {
  if (typeof value !== "string") return null;
  if (RESOURCE_TYPES.includes(value as ResourceType)) return value as ResourceType;
  if (value === "Notes") return "Revision Notes";
  if (value === "Sample Answers") return "Sample Answer";
  if (value === "Videos") return "Lesson";
  if (value === "Website" || value === "Other") return "Revision Notes";
  return null;
}

export function resolveResourceType(primary: unknown, values?: unknown): ResourceType {
  if (typeof primary === "string" && RESOURCE_TYPES.includes(primary as ResourceType)) return primary as ResourceType;
  const entries = Array.isArray(values) ? values : [];
  const all = [primary, ...entries];
  if (all.includes("Sample Answers")) return "Sample Answer";
  if (all.includes("Flashcards")) return "Flashcards";
  if (all.includes("Notes")) return "Revision Notes";
  if (all.includes("Videos")) return "Lesson";
  return normaliseResourceType(primary) ?? entries.map(normaliseResourceType).find(Boolean) ?? "Revision Notes";
}

export function resourceFormat(source: string | null | undefined, url?: string | null): ResourceFormat {
  if (source === "pdf" || source === "document") return "Document";
  if (source === "image") return "Image";
  return isDiscoverVideoUrl(url) ? "Video" : "Website";
}

export function documentContentType(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
  };
  return extension ? types[extension] ?? null : null;
}

export function isPdfDocument(name: string | null | undefined): boolean {
  return !!name && /\.pdf$/i.test(name);
}
