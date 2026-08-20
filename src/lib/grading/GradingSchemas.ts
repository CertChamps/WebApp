import { z } from "zod";

/** Coerce + clamp to [0, 1] so slightly-out-of-range model values still parse. */
const FractionSchema = z.preprocess((value) => {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}, z.number());

const BoolSchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return Boolean(value);
}, z.boolean());

const NumberSchema = z.preprocess((value) => {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}, z.number());

const RegionSchema = z.object({
  x: FractionSchema,
  y: FractionSchema,
  width: FractionSchema,
  height: FractionSchema,
});

const PointSchema = z.object({
  x: FractionSchema,
  y: FractionSchema,
});

export const Pass1Schema = z.object({
  parts: z.array(
    z.object({
      partId: z.preprocess((v) => String(v ?? "a"), z.string()),
      attempted: BoolSchema,
      transcript: z.preprocess((v) => (typeof v === "string" ? v : v == null ? "" : String(v)), z.string()),
      workingsRegion: RegionSchema.default({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }),
      answerLocation: PointSchema.default({ x: 0.5, y: 0.5 }),
    }),
  ).min(1),
});

const ErrorBoxSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const box = value as Record<string, unknown>;
  const width = Number(box.width);
  const height = Number(box.height);
  // Tiny boxes are useless — treat as "no box" rather than failing validation.
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && (width <= 0.005 || height <= 0.005)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return value;
}, RegionSchema);

export const Pass2Schema = z.object({
  totalAwarded: NumberSchema,
  totalAvailable: NumberSchema,
  isFullMarks: BoolSchema,
  overallFeedback: z.preprocess(
    (v) => (typeof v === "string" ? v : v == null ? "" : String(v)),
    z.string(),
  ).default(""),
  parts: z.array(
    z.object({
      partId: z.preprocess((v) => String(v ?? "a"), z.string()),
      marksAwarded: NumberSchema,
      marksAvailable: NumberSchema,
      isCorrect: BoolSchema,
      feedback: z.preprocess(
        (v) => (typeof v === "string" ? v : v == null ? "" : String(v)),
        z.string(),
      ).default(""),
      errors: z.array(
        z.object({
          id: z.preprocess((v) => String(v ?? "note"), z.string()),
          feedbackText: z.preprocess(
            (v) => (typeof v === "string" ? v : v == null ? "" : String(v)),
            z.string(),
          ),
          errorBox: ErrorBoxSchema.default({ x: 0, y: 0, width: 0, height: 0 }),
        }),
      ).default([]),
    }),
  ).default([]),
  answerMarkPosition: PointSchema.default({ x: 0.5, y: 0.5 }),
  markLabel: z.preprocess((v) => (typeof v === "string" ? v : v == null ? "" : String(v)), z.string()),
});
