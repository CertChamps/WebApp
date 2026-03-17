import { Pass1Schema, Pass2Schema } from "./GradingSchemas";
import type { CanvasCapturePayload, GradingResult, GradingStatus, Pass1Result, Pass2Result } from "./GradingTypes";
import { buildAnnotations } from "./annotationBuilder";
import { hashSnapshot } from "./canvasCapture";

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
  - The feedback throughout — in feedbackText fields and anywhere else text
    is returned — must be encouraging and personal. The student is trying hard.
    Acknowledge correct parts briefly before addressing errors. Never be blunt
    or clinical.
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
  parts: [
    {
      partId: string,
      marksAwarded: number,
      marksAvailable: number,
      isCorrect: boolean,
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

export type StreamChatResponse = (
  messages: Array<{ role: string; content: unknown }>,
  options?: { temperature?: number; top_p?: number; context?: string },
) => Promise<string>;

type GradingInput = {
  questionId: string;
  questionText: string;
  markingSchemeText: string;
  markingSchemeImages: string[];
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

function parseValidated<T>(raw: string, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }): T {
  const cleaned = stripCodeFences(raw);
  const parsed = JSON.parse(cleaned);
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Model response failed schema validation.");
  }
  return validated.data;
}

function parsePass2Validated(raw: string): Pass2Result {
  const cleaned = stripCodeFences(raw);
  const parsed = JSON.parse(cleaned) as {
    parts?: Array<{ errors?: Array<{ errorBox?: { x?: number; y?: number; width?: number; height?: number } }> }>;
  };

  if (Array.isArray(parsed.parts)) {
    for (const part of parsed.parts) {
      if (!Array.isArray(part.errors)) continue;
      for (const error of part.errors) {
        const box = error.errorBox;
        if (!box) continue;
        const width = Number(box.width);
        const height = Number(box.height);
        const isDegenerate = width > 0 && height > 0 && (width <= 0.005 || height <= 0.005);
        if (isDegenerate) {
          error.errorBox = { x: 0, y: 0, width: 0, height: 0 };
        }
      }
    }
  }

  const validated = Pass2Schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Model response failed schema validation.");
  }
  return validated.data;
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
          ].join("\n\n"),
        },
        { type: "image_url", image_url: { url: capturePayload.dataUrl } },
      ],
    },
  ]);

  const isAllUnattempted = (value: Pass1Result) =>
    value.parts.length > 0 && value.parts.every((part) => part.attempted === false);

  input.onStatus("reading");
  let pass1 = input.pass1Cache[cacheKey];
  if (!pass1 || isAllUnattempted(pass1)) {
    let lastParseOrApiError: unknown = null;
    const resolveAggressiveCapture = () =>
      input.getAggressiveCapture?.() ?? input.aggressiveFullInkCapture ?? input.fullInkCapture ?? capture;

    const pass1Attempts: Array<{ instruction: string; systemPrompt: string; capturePayload: () => CanvasCapturePayload }> = [
      {
        capturePayload: () => capture,
        instruction: "Locate and transcribe by part.",
        systemPrompt: PASS1_SYSTEM_PROMPT,
      },
      {
        capturePayload: resolveAggressiveCapture,
        instruction:
          "IMPORTANT: The student has confirmed they have written workings on this canvas. You must find them. Look for any faint marks, light pencil strokes, or partially visible writing. Even a single digit counts as an attempt. Do not return attempted: false for any part unless you are certain beyond doubt it is blank.",
        systemPrompt: PASS1_SYSTEM_PROMPT,
      },
      {
        capturePayload: resolveAggressiveCapture,
        instruction:
          "For each question part, assign any writing you can find to the most likely part. If unsure, assign it to part a. Do not return empty transcripts. If you see any marks at all, transcribe them.",
        systemPrompt:
          "Look at this whiteboard image. I need you to find any handwritten numbers, letters, equations, or mathematical working anywhere in the image - regardless of whether they seem related to the question.\n\nFor each question part listed below, assign any writing you can find to the most likely part it belongs to. If you cannot tell which part it belongs to, assign it to part a.\n\nDo not return empty transcripts. If you see any marks at all, transcribe them. Return the same JSON structure as before.",
      },
    ];

    for (const attempt of pass1Attempts) {
      const capturePayload = attempt.capturePayload();
      const pass1Raw = await input.streamChatResponse(
        [{ role: "system", content: attempt.systemPrompt }, ...buildPass1User(capturePayload, attempt.instruction)],
        { temperature: 0.1, top_p: 0.9 },
      );

      try {
        const parsed = parseValidated(pass1Raw, Pass1Schema);
        pass1 = parsed;
        if (!isAllUnattempted(parsed)) break;
      } catch (err) {
        lastParseOrApiError = err;
      }
    }

    if (!pass1 && lastParseOrApiError) {
      throw lastParseOrApiError;
    }

    if (!pass1) {
      throw new Error("Pass 1 failed after retries.");
    }

    input.setPass1Cache((prev) => ({ ...prev, [cacheKey]: pass1! }));
  }

  input.onStatus("marking");
  const pass2UserText = [
    `Question:\n${input.questionText}`,
    `Marking scheme:\n${input.markingSchemeText}`,
    "Pass 1 result:",
    JSON.stringify(pass1),
  ].join("\n\n");

  const pass2UserContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: pass2UserText },
    { type: "image_url", image_url: { url: capture.dataUrl } },
    ...input.markingSchemeImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];

  let pass2Raw = "";
  let pass2: Pass2Result;
  try {
    pass2Raw = await input.streamChatResponse(
      [{ role: "system", content: PASS2_SYSTEM_PROMPT }, { role: "user", content: pass2UserContent }],
      { temperature: 0.1, top_p: 0.9 },
    );
    pass2 = parsePass2Validated(pass2Raw);
  } catch (firstErr) {
    const retryRaw = await input.streamChatResponse(
      [{ role: "system", content: PASS2_SYSTEM_PROMPT }, { role: "user", content: pass2UserContent }],
      { temperature: 0.1, top_p: 0.9 },
    );
    try {
      pass2 = parsePass2Validated(retryRaw);
    } catch {
      console.error("Pass2 raw first", pass2Raw);
      console.error("Pass2 raw retry", retryRaw);
      throw firstErr;
    }
  }

  input.onStatus("rendering");
  const annotations = buildAnnotations(pass1, pass2, capture.captureWorldBounds);

  input.onStatus("done");
  return { pass1, pass2, annotations };
}
