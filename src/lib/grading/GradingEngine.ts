import { Pass1Schema, Pass2Schema } from "./GradingSchemas";
import type { CanvasCapturePayload, GradingResult, GradingStatus, Pass1Result, Pass2Result } from "./GradingTypes";
import { buildAnnotations } from "./annotationBuilder";
import { hashSnapshot } from "./canvasCapture";
import { AiRequestError } from "../aiApi";

export const PASS1_SYSTEM_PROMPT = `You are an expert exam marker assistant completing the first step
of a structured two-pass marking process.

You will be given:
  - An image of a student's whiteboard
  - The world-space bounds of this image as { x, y, width, height }
  - The exam question with all its parts (a, b, c...)

You are looking at a student's handwritten exam workings.
Your task is to find and transcribe their attempt at each question part.

Important: students write on a whiteboard, so strokes may be faint,
imprecise, or partially erased. Treat all mathematical notation,
numbers, letters, equations, diagrams, and working steps as valid
workings even if they appear rough or incomplete.

Set attempted: false ONLY if the image contains literally zero
marks, pixels, or strokes anywhere in the region for this part.

In every other case - even if the marks are very faint, very messy,
incomplete, a single number, a single letter, a crossed-out attempt,
or something you cannot fully read - set attempted: true and transcribe
whatever you can see.

If you genuinely cannot read something, write your best guess in the
transcript and add [unclear] after it. Never leave the transcript
empty if attempted is true.

You will never be penalised for transcribing something incorrectly.
You will cause a system failure if you set attempted: false when marks
are present. Err heavily toward attempted: true.

If you are uncertain whether marks relate to a part, include them.
It is far better to include irrelevant marks than to miss real workings.

For each question part:
  1. Find the student's workings relevant to that part
  2. Ignore everything else: doodles, unrelated calculations, notes,
     other questions. Only include workings that are clearly an attempt
     at the specific part.
  3. Transcribe exactly what the student has written for that part
  4. Record the bounding region of those workings as normalised fractions
     (0 to 1) relative to the provided image dimensions
  5. Record the position of what appears to be the final answer for that
     part — this is where the mark will be placed

If a part has no visible workings, note it as unattempted.

Return ONLY this JSON, nothing else, no markdown fences:
{
  parts: [
    {
      partId: string,
      attempted: boolean,
      transcript: string,
      workingsRegion: {
        x: number,
        y: number,
        width: number,
        height: number
      },
      answerLocation: {
        x: number,
        y: number
      }
    }
  ]
}`;

export const PASS2_SYSTEM_PROMPT = `You are an expert exam marker completing the second step of a
structured marking process.

You have already located and transcribed the student's workings.
Now mark each part strictly against the marking scheme provided.

Rules:
  - Award marks only for what is clearly present and correct
  - If a step is partially correct, use your judgment on partial credit
    within the marks available — be consistent with exam board standards
  - If the student's handwriting is ambiguous but the answer is plausible,
    give benefit of the doubt and note it
  - Feedback must cite the specific error: name the line or step that
    was wrong and explain precisely what is missing or incorrect
  - Write ALL student-facing text in English, even when the question or the
    student's work is in Irish, French, German, Spanish, or another language.
    You may quote original-language phrases from the work, but explanations
    must be English.
  - Write all feedback in second person, directly addressing the student as 'you'.
    Never refer to 'the student', 'the answer', or use third-person phrasing.
    Every feedbackText must start with 'You' or address the student directly
    within the first four words.
    Examples:
      Wrong:  'The student forgot to apply the chain rule here'
      Correct: 'You forgot to apply the chain rule here'
      Wrong:  'The working shows an incorrect sign change'
      Correct: 'You dropped a negative sign when expanding the bracket'
      Wrong:  'The final answer is missing the constant of integration'
      Correct: 'You missed the constant of integration $+c$ at the end'
  - Write all mathematical expressions, equations, variables, and symbols
    in LaTeX wrapped in dollar signs
  - Use inline LaTeX for expressions in a sentence: $x^2 + 2x$
  - Use block LaTeX for standalone equations: $$\frac{dy}{dx} = 2x$$
  - Every mathematical expression must use LaTeX; plain-text counts in
    non-mathematical context may remain plain text
  - Never award more marks than available for any part
  - Be concise in feedback — one clear sentence per error, no padding
  - The feedback throughout — in overallFeedback, part feedback, feedbackText
    fields, and anywhere else text is returned — must be encouraging and personal.
    The student is trying hard. Acknowledge correct parts briefly before addressing
    errors. Never be blunt or clinical.
  - overallFeedback: if the question has multiple parts, write ONE overview
    sentence on the whole answer. If it is a single-part question, write brief
    but detailed feedback on the answer here (the UI will not show part headings).
  - For each part, also write a brief but detailed 'feedback' string covering
    that part. If the part is fully correct, say so clearly.
  - Some parts may have attempted: false, meaning no workings were found
  - For attempted: false parts:
      - Set marksAwarded: 0
      - Set isCorrect: false
      - Set errors to a single entry with feedbackText exactly:
        'No workings found for this part.'
      - Set errorBox to { x: 0, y: 0, width: 0, height: 0 }
  - Every part in the input must appear in the output; do not omit any part

For each error that needs a canvas annotation:
  - When drawing the bounding box for an error, always encapsulate the entire
    line or step that contains the mistake — not just the specific symbol or
    term that is wrong.
  - For example: if the error is a wrong exponent in the middle of a line of
    algebra, the box must wrap the whole line from the leftmost symbol to the
    rightmost symbol on that line.
  - If the error spans multiple lines (e.g. a substitution carried across two
    lines), include all lines in the box.
  - The box should never be smaller than a single full line of working. Tight
    boxes around individual characters or terms are not acceptable — they are
    too small to be useful and too easy for the student to miss.
  - Add approximately 8px padding above and below the line content so the box
    does not clip ascenders or descenders.
  - Return the box as normalised fractions (0-1) relative to image dimensions

Return ONLY this JSON, nothing else, no markdown fences:
{
  totalAwarded: number,
  totalAvailable: number,
  isFullMarks: boolean,
  overallFeedback: string,
  parts: [
    {
      partId: string,
      marksAwarded: number,
      marksAvailable: number,
      isCorrect: boolean,
      feedback: string,
      errors: [
        {
          id: string,
          feedbackText: string,
          errorBox: {
            x: number,
            y: number,
            width: number,
            height: number
          }
        }
      ]
    }
  ],
  answerMarkPosition: {
    x: number,
    y: number
  },
  markLabel: string - the mark as awarded/available, e.g. '7/10'.
  Always include both numbers separated by a forward slash.
  Never write just the awarded mark alone.
}`;

export const PASS2_ADAPTIVE_SYSTEM_PROMPT = `You are an expert tutor reviewing a student's whiteboard work.

You may NOT have an official marking scheme. Adapt to the material:
  - If question images are provided, treat those as the question the student is answering
  - If this is custom / uploaded / freeform work with no clear exam mark allocation,
    focus on helpful, encouraging feedback rather than inventing a rigid mark scheme
  - Only award numerical marks when it clearly suits the task (e.g. a standard
    exam-style question with obvious part marks, or a marking scheme image is present)
  - When marks are NOT suitable: set totalAvailable: 0, totalAwarded: 0,
    isFullMarks: false, markLabel: "", and set each part's marksAvailable /
    marksAwarded to 0. Still give useful feedback via the errors array
    (constructive notes count as "errors" for annotation purposes — write them
    in second person). For fully correct work with no marks, leave errors empty
    and set isCorrect: true
  - When marks ARE suitable: award fairly, use markLabel like '7/10', and follow
    normal marking judgment

Rules that always apply:
  - Write ALL student-facing text in English, even when the question or the
    student's work is in another language. Quotes from the work may stay in
    the original language; explanations must be English.
  - Write all feedback in second person, directly addressing the student as 'you'.
    Never refer to 'the student', 'the answer', or use third-person phrasing.
    Every feedbackText must start with 'You' or address the student directly
    within the first four words.
  - Write all mathematical expressions in LaTeX wrapped in dollar signs
  - Be concise — one clear sentence per note, encouraging and personal
  - Feedback must cite the specific place in the working when pointing out a mistake
  - overallFeedback: one overview sentence when there are multiple parts;
    brief but detailed answer feedback when there is a single part
  - For each part, write a brief but detailed 'feedback' string
  - Some parts may have attempted: false
  - For attempted: false parts:
      - Set marksAwarded: 0
      - Set isCorrect: false
      - Set errors to a single entry with feedbackText exactly:
        'No workings found for this part.'
      - Set errorBox to { x: 0, y: 0, width: 0, height: 0 }
  - Every part in the input must appear in the output; do not omit any part

For each feedback note that needs a canvas annotation:
  - When drawing the bounding box, encapsulate the entire line or step —
    not just a single symbol
  - Add approximately 8px padding above and below
  - Return the box as normalised fractions (0-1) relative to image dimensions

Return ONLY this JSON, nothing else, no markdown fences:
{
  totalAwarded: number,
  totalAvailable: number,
  isFullMarks: boolean,
  overallFeedback: string,
  parts: [
    {
      partId: string,
      marksAwarded: number,
      marksAvailable: number,
      isCorrect: boolean,
      feedback: string,
      errors: [
        {
          id: string,
          feedbackText: string,
          errorBox: {
            x: number,
            y: number,
            width: number,
            height: number
          }
        }
      ]
    }
  ],
  answerMarkPosition: {
    x: number,
    y: number
  },
  markLabel: string - '7/10' when awarding marks, or '' when feedback-only.
}`;

export type StreamChatResponse = (
  messages: Array<{ role: string; content: unknown }>,
  options?: { temperature?: number; top_p?: number; context?: string; usageId?: string },
) => Promise<string>;

type GradingInput = {
  usageId: string;
  questionId: string;
  questionText: string;
  markingSchemeText: string;
  markingSchemeImages: string[];
  /** Question paper / upload images so the model can see what was asked. */
  questionImages?: string[];
  /**
   * When true (no formal marking scheme), use adaptive tutor prompting and
   * only award marks when it clearly suits the task.
   */
  adaptiveMarking?: boolean;
  capture: CanvasCapturePayload;
  fullInkCapture?: CanvasCapturePayload | null;
  aggressiveFullInkCapture?: CanvasCapturePayload | null;
  getAggressiveCapture?: (() => CanvasCapturePayload | null) | null;
  streamChatResponse: StreamChatResponse;
  pass1Cache: Record<string, Pass1Result>;
  setPass1Cache: (updater: (prev: Record<string, Pass1Result>) => Record<string, Pass1Result>) => void;
  onStatus: (status: GradingStatus) => void;
};

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline < 0) return trimmed;
  let body = trimmed.slice(firstNewline + 1);
  if (body.endsWith("```")) {
    body = body.slice(0, -3);
  }
  return body.trim();
}

/** Pull the first JSON object out of model text (prose wrappers / fences). */
function extractJsonObject(raw: string): unknown {
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("No JSON object found in model response.");
  }
}

function parseValidated<T>(
  raw: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error?: unknown } },
): T {
  const parsed = extractJsonObject(raw);
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Model response failed schema validation.");
  }
  return validated.data;
}

function parsePass2Validated(raw: string): Pass2Result {
  const parsed = extractJsonObject(raw);
  const validated = Pass2Schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Model response failed schema validation.");
  }
  return validated.data;
}

function defaultPass1(): Pass1Result {
  return {
    parts: [
      {
        partId: "a",
        attempted: true,
        transcript: "[unclear]",
        workingsRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        answerLocation: { x: 0.5, y: 0.5 },
      },
    ],
  };
}

function fallbackPass2(pass1: Pass1Result, rawText?: string): Pass2Result {
  const cleaned = (rawText ?? "").replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  let note =
    "I've looked over your workings and left what I could. Try Check Answer again if you want another pass.";
  if (cleaned.length > 40 && cleaned.length < 600 && !cleaned.startsWith("{")) {
    note = cleaned;
  }
  if (!/^you\b/i.test(note)) {
    note = `You can use this note: ${note}`;
  }

  return {
    totalAwarded: 0,
    totalAvailable: 0,
    isFullMarks: false,
    overallFeedback: note,
    markLabel: "",
    answerMarkPosition: { x: 0.5, y: 0.5 },
    parts: pass1.parts.map((part) => ({
      partId: part.partId,
      marksAwarded: 0,
      marksAvailable: 0,
      isCorrect: false,
      feedback: part.attempted ? note : "No workings found for this part.",
      errors: [
        {
          id: "fallback",
          feedbackText: part.attempted
            ? note
            : "No workings found for this part.",
          errorBox: { x: 0, y: 0, width: 0, height: 0 },
        },
      ],
    })),
  };
}

function isHardAiFailure(err: unknown): boolean {
  return err instanceof AiRequestError || (err instanceof Error && /quota|sign in|allowance|AUTH/i.test(err.message));
}

export async function runGrading(input: GradingInput): Promise<GradingResult> {
  const { capture } = input;
  const snapshotHash = hashSnapshot(capture.dataUrl);
  const cacheKey = `${input.questionId}-${snapshotHash}`;

  input.onStatus("capturing");

  const buildPass1User = (capturePayload: CanvasCapturePayload, instruction: string) => ([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            `Question:\n${input.questionText}`,
            `Capture world bounds: ${JSON.stringify(capturePayload.captureWorldBounds)}`,
            "canvasDensityNote: This image contains handwritten mathematical workings. Pencil strokes may appear faint. Treat any marks, numbers, symbols, or letters as intentional workings unless they are clearly decorative doodles unrelated to the question.",
            instruction,
            (input.questionImages?.length ?? 0) > 0
              ? "Question images are attached after this text (before the student whiteboard). Use them to understand what was asked."
              : "",
            "Always return valid JSON matching the required schema — never refuse, never return an empty response.",
          ].filter(Boolean).join("\n\n"),
        },
        ...(input.questionImages ?? []).slice(0, 4).map((url) => ({
          type: "image_url" as const,
          image_url: { url },
        })),
        { type: "image_url", image_url: { url: capturePayload.dataUrl } },
      ],
    },
  ]);

  input.onStatus("reading");
  let pass1 = input.pass1Cache[cacheKey];
  if (!pass1) {
    // One read pass only — do not burn quota on aggressive "find faint ink" retries.
    // Prefer proceeding with a best-effort transcript (or a safe default) over erroring out.
    const capturePayload = input.fullInkCapture ?? capture;
    let pass1Raw = "";
    try {
      pass1Raw = await input.streamChatResponse(
        [
          { role: "system", content: PASS1_SYSTEM_PROMPT },
          ...buildPass1User(capturePayload, "Locate and transcribe by part. Return JSON only."),
        ],
        { temperature: 0.1, top_p: 0.9, usageId: input.usageId },
      );
      pass1 = parseValidated(pass1Raw, Pass1Schema);
    } catch (err) {
      if (isHardAiFailure(err)) throw err;
      console.warn("[grading] Pass1 parse failed — using default transcript", err);
      console.warn("[grading] Pass1 raw", pass1Raw?.slice?.(0, 800));
      pass1 = defaultPass1();
    }

    input.setPass1Cache((prev) => ({ ...prev, [cacheKey]: pass1! }));
  }

  input.onStatus("marking");
  const adaptive = Boolean(input.adaptiveMarking);
  const pass2SystemPrompt = adaptive ? PASS2_ADAPTIVE_SYSTEM_PROMPT : PASS2_SYSTEM_PROMPT;
  const pass2UserText = [
    `Question:\n${input.questionText}`,
    adaptive
      ? (input.markingSchemeText
          ? `Reference material (may be incomplete):\n${input.markingSchemeText}`
          : "No official marking scheme was provided. Adapt: give useful feedback, and only award marks if clearly suited.")
      : `Marking scheme:\n${input.markingSchemeText}`,
    "Pass 1 result:",
    JSON.stringify(pass1),
    "Always return valid JSON matching the required schema. Prefer useful feedback over refusing.",
  ].join("\n\n");

  const pass2UserContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: pass2UserText },
    ...(input.questionImages ?? []).slice(0, 4).map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
    { type: "image_url", image_url: { url: capture.dataUrl } },
    ...input.markingSchemeImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];

  // Single marking pass — no blind retry. On parse failure, still return salvageable feedback.
  let pass2Raw = "";
  let pass2: Pass2Result;
  try {
    pass2Raw = await input.streamChatResponse(
      [{ role: "system", content: pass2SystemPrompt }, { role: "user", content: pass2UserContent }],
      { temperature: 0.1, top_p: 0.9, usageId: input.usageId },
    );
    pass2 = parsePass2Validated(pass2Raw);
  } catch (err) {
    if (isHardAiFailure(err)) throw err;
    console.warn("[grading] Pass2 parse failed — returning fallback feedback", err);
    console.warn("[grading] Pass2 raw", pass2Raw?.slice?.(0, 800));
    pass2 = fallbackPass2(pass1, pass2Raw);
  }

  // Ensure every Pass1 part appears in Pass2 output.
  if (pass2.parts.length === 0) {
    pass2 = fallbackPass2(pass1, pass2Raw);
  }

  input.onStatus("rendering");
  const annotations = buildAnnotations(pass1, pass2, capture.captureWorldBounds);

  input.onStatus("done");
  return { pass1, pass2, annotations };
}
