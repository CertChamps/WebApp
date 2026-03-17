import { z } from "zod";

const FractionSchema = z.number().min(0).max(1);

export const Pass1Schema = z.object({
  parts: z.array(
    z.object({
      partId: z.string(),
      attempted: z.boolean(),
      transcript: z.string(),
      workingsRegion: z.object({
        x: FractionSchema,
        y: FractionSchema,
        width: FractionSchema,
        height: FractionSchema,
      }),
      answerLocation: z.object({
        x: FractionSchema,
        y: FractionSchema,
      }),
    }),
  ),
});

export const Pass2Schema = z.object({
  totalAwarded: z.number(),
  totalAvailable: z.number(),
  isFullMarks: z.boolean(),
  parts: z.array(
    z.object({
      partId: z.string(),
      marksAwarded: z.number(),
      marksAvailable: z.number(),
      isCorrect: z.boolean(),
      errors: z.array(
        z.object({
          id: z.string(),
          feedbackText: z.string(),
          errorBox: z.object({
            x: FractionSchema,
            y: FractionSchema,
            width: FractionSchema,
            height: FractionSchema,
          }),
        }).refine(
          (e) =>
            (e.errorBox.width === 0 && e.errorBox.height === 0) ||
            (e.errorBox.width > 0.005 && e.errorBox.height > 0.005),
          {
            message: "errorBox is too small to be a real region",
          },
        ),
      ),
    }),
  ),
  answerMarkPosition: z.object({
    x: FractionSchema,
    y: FractionSchema,
  }),
  markLabel: z.string(),
});
