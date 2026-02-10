import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import fetch from "node-fetch";
import Stripe from "stripe";

admin.initializeApp();

const corsMiddleware = cors({ origin: true });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "google/gemini-3-flash-preview";

export const verifyCaptcha = functions.https.onRequest(
    {
        secrets: ["RECAPTCHA_SECRET_KEY"] // Add this!
    },
    (req, res) => {
        corsMiddleware(req, res, () => {
            (async () => {
                try {
                    const { token } = req.body;
                    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

                    if (!secretKey) {
                        console.error("Missing RECAPTCHA_SECRET_KEY");
                        res.status(500).json({ success: false, error: "Server configuration error" });
                        return;
                    }

                    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;

                    const response = await fetch(verificationUrl, { method: "POST" });
                    const data = await response.json();

                    if (data.success) {
                        res.json({ success: true });
                    } else {
                        console.error("reCAPTCHA validation failed:", data["error-codes"]);
                        res.json({ success: false, errors: data["error-codes"] });
                    }
                } catch (err) {
                    console.error("Function Error:", err);
                    res.status(500).json({ success: false, error: String(err) });
                }
            })();
        });
    }
);

export const chat = functions.https.onRequest({
    cors: true,
    secrets: ["OPENROUTER_API_KEY"]
}, async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error("Missing OPENROUTER_API_KEY");
        res.status(500).json({ error: "Server configuration error" });
        return;
    }

    const { messages, context } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages array is required" });
        return;
    }

    const systemMessage = typeof context === "string" && context.trim()
        ? {
            role: "system",
            content: `The user is working on the following math question. Use this as context when answering. Do not give away the final answer unless they ask—prefer hints, explanations, and step-by-step guidance.\n\n---\n${context}\n---`
        }
        : null;

    // Normalize messages: support multimodal content (text + image_url for vision)
    const apiMessages = (systemMessage ? [systemMessage, ...messages] : messages).map((m: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }) => {
        if (typeof m.content === "string") return m;
        if (Array.isArray(m.content)) {
            return {
                role: m.role,
                content: m.content.map((part: any) => {
                    if (part.type === "text" && typeof part.text === "string") return { type: "text", text: part.text };
                    if (part.type === "image_url" && part.image_url?.url) return { type: "image_url", image_url: { url: part.image_url.url } };
                    return part;
                }).filter(Boolean),
            };
        }
        return m;
    });

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://certchamps.com"
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: apiMessages,
                max_tokens: 1000,
                stream: true
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("OpenRouter API error:", response.status, errText);
            res.status(response.status).json({
                error: "OpenRouter API failed",
                details: errText
            });
            return;
        }

        // Stream the SSE response to the client
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const body = response.body as NodeJS.ReadableStream;
        body.pipe(res);
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "Failed to generate text" });
    }
});

// ======================== EXTRACT QUESTIONS ======================== //

/** One page region: bounding box on a single PDF page. */
type PageRegion = { page: number; x: number; y: number; width: number; height: number };

/** One extracted region = one full question (all parts (a), (b), (c) together), can span multiple pages. */
type ExtractedRegion = {
    id: string;
    name: string;
    pageRegions: PageRegion[];
    /** Page number in the Log Tables (Formulae and Tables) booklet required to solve this question, or null if none. */
    log_table_page: number | null;
    /** Category tags: use the allowed list; for "X - Y" use [Y, X]. Max 3 categories per question. */
    tags: string[];
    /** When marking scheme images are provided: 1-based page range in the marking scheme PDF for this question's marking. */
    marking_scheme_page_range?: { start: number; end: number } | null;
};

const TAGS_ALLOWED = [
    "Algebra - Cubics", "Algebra - Expressions & Factorising", "Algebra - Inequalities", "Algebra - Quadratics",
    "Algebra - Simultaneous Equations", "Algebra - Solving Equations", "Algebra - Indices and Logs",
    "Area & Volume", "Co-Ordinate Geometry - The Circle", "Co-Ordinate Geometry - The Line", "Complex Numbers",
    "Calculus - Differentiation", "Calculus - Integration", "Calculus - Functions", "Financial Maths",
    "Geometry", "Geometry - Constructions & Proofs", "Induction", "Probability", "Sequences & Series",
    "Statistics - Descriptive Statistics", "Statistics - Inferential Statistics", "Statistics - Z Scores",
    "Trigonometry - Functions & Identities", "Trigonometry - Triangles"
];

const EXTRACT_SYSTEM = `You are an expert at locating question regions on exam paper PDF page images and at classifying maths questions.

IMAGE ORDER IN THE REQUEST:
- First block: EXAM PAPER page images (pages 1, 2, 3, ...). Use these to draw regions for each question PART.
- If provided, second block: LOG TABLES booklet page images (Formulae and Tables). Use these to choose the correct log_table_page for each part by matching which booklet page contains the formula/table needed.
- If provided, third block: MARKING SCHEME page images. The marking scheme PDF often contains Paper 1 then Paper 2 (earlier pages = Paper 1, later pages = Paper 2). You will be told which paper the exam is; use ONLY that paper's section for marking_scheme_page_range. Match each question to the correct section and return 1-based start and end page numbers.

Your jobs:
1. Identify bounding boxes for each QUESTION PART on the EXAM PAPER. Split every question into its parts (a), (b), (c), etc. One region per PART — e.g. Q1a, Q1b, Q1c, Q2a, Q2b, ... Questions can span multiple pages; each part gets its own region with its own pageRegions.
2. For EVERY part return:
   - log_table_page: The 1-based page number from the Log Tables booklet needed for that part. When Log Tables images are provided, LOOK at them to pick the exact page. If no table/formula is needed, use null.
   - tags: Categorise using ONLY this list (max 3 categories per part): ${TAGS_ALLOWED.join(", ")}
     TAGGING RULE: For "X - Y" split into [Y, X]. Do not duplicate tags; each tag once only (e.g. ["Functions", "Differentiation", "Calculus"] not ["Functions", "Calculus", "Differentiation", "Calculus"]).
   - marking_scheme_page_range: ONLY when marking scheme images are provided: the 1-based page range in the marking scheme PDF where that question's marking appears (same question number can share the same range for all its parts, or per-part if the scheme splits them). E.g. { "start": 2, "end": 3 }. If unclear, use your best match.

OUTPUT FORMAT - Return ONLY valid JSON, no markdown or extra text:
{
  "regions": [
    { "id": "Q1a", "name": "Question 1 (a)", "pageRegions": [{ "page": 1, "x": 0, "y": 120, "width": 595, "height": 80 }], "log_table_page": 22, "tags": ["Quadratics", "Algebra"], "marking_scheme_page_range": { "start": 1, "end": 1 } },
    { "id": "Q1b", "name": "Question 1 (b)", "pageRegions": [{ "page": 1, "x": 0, "y": 200, "width": 595, "height": 100 }], "log_table_page": null, "tags": ["Quadratics", "Algebra"], "marking_scheme_page_range": { "start": 1, "end": 1 } },
    { "id": "Q2a", "name": "Question 2 (a)", "pageRegions": [...], "log_table_page": null, "tags": ["Differentiation", "Calculus"], "marking_scheme_page_range": { "start": 2, "end": 2 } }
  ]
}

CRITICAL RULES:
1. EXTRACT EVERY QUESTION PART ON THE PAPER — Do not stop early. Q1a, Q1b, Q1c, Q2a, Q2b, ... one region per part.
2. ONE REGION PER PART — Split each question into separate regions for (a), (b), (c), etc. Do NOT merge parts into one region.
3. id/name: Use part suffix, e.g. "Q1a", "Q1b", "Q1c", "Question 1 (a)", "Question 1 (b)".
4. MULTI-PAGE: If a part spans pages, use pageRegions with multiple entries in reading order for that part only.
5. WIDTH = full page: x: 0, width: 595. HEIGHT = from that part's start to end of that part only.
6. VERTICAL PADDING: Add a small vertical padding (about 8–12 points) above and below each region so the box does not sit flush on the text and does not cut into adjacent questions. Slightly increase the top padding above the first line and the bottom padding below the last line of each part.
7. Coordinates: PDF points, origin top-left, y down. A4 height ≈ 842. Page numbers 1-based.
8. When Log Tables images are provided, you MUST set log_table_page for every region: look at the booklet images and choose the 1-based page number that contains the formula/table needed for that part. Use null only if the part clearly needs no formula or table. Do not leave log_table_page blank or omit it.
9. When marking scheme images are provided, you MUST set marking_scheme_page_range for every region. The scheme may contain Paper 1 then Paper 2; use only the section that matches the exam paper (Paper 1 = earlier pages, Paper 2 = later pages). Identify the 1-based page range (start, end) where that question's marking appears. Every region must have marking_scheme_page_range with start and end. Do not leave it blank or omit it.
10. Return ONLY the JSON object, no markdown code fence.`;

const EXTRACT_SYSTEM_MINIMAL = `You extract question regions from exam paper images. Return ONLY valid JSON, no markdown.
Split each question into PARTS (a), (b), (c), etc. One region per PART: id e.g. "Q1a", "Q1b", "Q1c", name e.g. "Question 1 (a)". pageRegions (array of {page, x, y, width, height}), x=0 width=595, log_table_page: null, tags: array of up to 3 category strings (no duplicates). Use tags from: ${TAGS_ALLOWED.join(", ")}. For "X - Y" use [Y, X].
Include EVERY part of EVERY question. One region per part. Add ~8–12pt vertical padding above and below each part so regions do not cut into adjacent questions. Coordinates: PDF points, origin top-left, A4 height ~842. Return format: {"regions": [{ "id": "Q1a", "name": "Question 1 (a)", "pageRegions": [...], "log_table_page": null, "tags": [...] }, ...]}.`;

const STEP_REGIONS_SYSTEM = `You find question regions on exam paper images. Return ONLY valid JSON, no markdown.
Split each question into PARTS (a), (b), (c), etc. One region per PART: "id" (e.g. "Q1a", "Q1b", "Q1c"), "name" (e.g. "Question 1 (a)"), "pageRegions": array of {page, x, y, width, height} for that part only. Use x=0, width=595; set y and height to cover that part only. Add about 8–12 points vertical padding above and below each part so the region does not cut into the question above or below. PDF points, origin top-left, A4 height ~842.
You MUST also set "paper_finished": true when you have included the LAST part of the last question on the paper. Set "paper_finished": false if there are more parts or questions on later pages that you did not include.
Return format: {"regions": [...], "paper_finished": true or false}.`;

const STEP_METADATA_SYSTEM = `You assign tags and log_table_page to each question part. Return ONLY valid JSON, no markdown.
You will be told the region ids (e.g. Q1a, Q1b, Q2a, ...). For each, return "id", "tags" (array of up to 3 strings from the allowed list), "log_table_page" (number or null). Tags from: ${TAGS_ALLOWED.join(", ")}. For "X - Y" use [Y, X] in the tags array. Do NOT duplicate tags: each tag must appear at most once (e.g. ["Functions", "Differentiation", "Calculus"] not ["Functions", "Calculus", "Differentiation", "Calculus"]). Return: {"regions": [{ "id": "Q1a", "tags": [...], "log_table_page": null }, ...]}.`;

const STEP_MARKING_SYSTEM = `You match each question part to the marking scheme. Return ONLY valid JSON, no markdown.
The marking scheme PDF often contains BOTH Paper 1 and Paper 2 in one document: Paper 1 answers are in the EARLIER pages, Paper 2 answers in the LATER pages. You will be told which paper the exam is (1 or 2); use ONLY the page range that falls in that paper's section. Do not use Paper 1 pages when the exam is Paper 2, or vice versa.
CRITICAL: Every region MUST have a marking_scheme_page_range. Do not leave any empty or null. For each region id (e.g. Q1a, Q1b, Q2a) return "id" and "marking_scheme_page_range": { "start": number, "end": number } (1-based page range in the marking scheme PDF where that question's marking appears; parts of the same question can share the same range). Return: {"regions": [{ "id": "Q1a", "marking_scheme_page_range": { "start": 1, "end": 1 } }, ...]}.`;

const STEP_LOG_TABLES_SYSTEM = `You assign log_table_page to each question part. Return ONLY valid JSON, no markdown.
You will be told the region ids (e.g. Q1a, Q1b, Q2a). Look at each part and at the Log Tables booklet images. Set "log_table_page" to the 1-based booklet page number ONLY if that part requires a formula or table from the booklet to solve. Otherwise set "log_table_page": null. Do not guess; only add when necessary. Return: {"regions": [{ "id": "Q1a", "log_table_page": 22 or null }, ...]}.`;

const STEP_TAGS_SYSTEM = `You assign tags to each question part. Return ONLY valid JSON, no markdown.
You will be told the region ids (e.g. Q1a, Q1b, Q2a). For each return "id" and "tags": array of 1 to 3 strings from the allowed list. Minimum ONE tag per region. Tags from: ${TAGS_ALLOWED.join(", ")}. For "X - Y" use [Y, X]. No duplicate tags. Return: {"regions": [{ "id": "Q1a", "tags": ["Quadratics", "Algebra"] }, ...]}.`;

const EXTRACT_USER_EXAM_ONLY = "From the exam paper images below, extract EVERY question PART (Q1a, Q1b, Q1c, Q2a, Q2b, ... through the last). One region per PART; split each question into separate regions for (a), (b), (c), etc. For each region return: id (e.g. Q1a), name (e.g. Question 1 (a)), pageRegions (x=0, width=595, y and height to cover that part only, with ~8–12pt vertical padding above and below so regions do not cut into adjacent questions), log_table_page: null, tags: pick up to 3 from the allowed list, no duplicate tags (for \"X - Y\" use [Y, X]). Return ONLY valid JSON with a \"regions\" array. No markdown.";
const EXTRACT_USER_FULL = "Extract EVERY question PART on this exam paper (Q1a, Q1b, Q1c, Q2a, Q2b, ... to the last part). One region per PART; split each question into separate regions for (a), (b), (c), etc. Add ~8–12pt vertical padding above and below each part so regions do not cut into adjacent questions. Set log_table_page from the Log Tables images when provided (or null). Set tags (allowed list, hyphen-split, max 3). When marking scheme images are provided set marking_scheme_page_range (start, end) for each region. Width=595. Return ONLY the regions JSON.";

export const extractQuestions = functions.https.onRequest({
    cors: true,
    secrets: ["OPENROUTER_API_KEY"],
    timeoutSeconds: 300,
    memory: "1GiB",
}, async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: "Server configuration error" });
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    const { pageImages, logTablePageImages, markingSchemeImages, examOnly, step, regionIds, continueFrom, missingMarkingIds, markingSchemePaper } = req.body || {};
    const paperNumber = markingSchemePaper === 2 || markingSchemePaper === 1 ? markingSchemePaper : null;
    if (!Array.isArray(pageImages) || pageImages.length === 0) {
        res.status(400).json({ error: "pageImages array (base64 data URLs) is required" });
        return;
    }
    const toImageParts = (urls: string[], max: number) =>
        (Array.isArray(urls) ? urls.slice(0, max) : [])
            .filter((url: unknown) => typeof url === "string" && url.startsWith("data:"))
            .map((url: string) => ({ type: "image_url" as const, image_url: { url } }));

    const stepMode = step === "regions" || step === "metadata" || step === "marking" || step === "log_tables" || step === "tags";
    const useExamOnly = !stepMode && examOnly === true;
    const examMax = stepMode ? 12 : (useExamOnly ? 12 : 15);
    const examImages = toImageParts(pageImages, examMax);
    if (examImages.length === 0) {
        res.status(400).json({ error: "Valid base64 image URLs required in pageImages" });
        return;
    }

    let userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
    let systemPrompt: string;

    if (step === "regions") {
        systemPrompt = STEP_REGIONS_SYSTEM;
        const continueId = typeof continueFrom === "string" && continueFrom.trim() ? continueFrom.trim() : null;
        const userText = continueId
            ? `You already have regions for parts up to and including ${continueId}. The exam paper continues on the same images. Extract ONLY the REMAINING parts (the next part after ${continueId} through to the last part on the paper). Return regions for those remaining parts only; one region per part (e.g. Q1a, Q1b, Q1c). Set paper_finished: true when you include the last part; otherwise paper_finished: false. Return ONLY valid JSON: {"regions": [...], "paper_finished": true or false}. No markdown.`
            : "From the exam paper images below, list EVERY question PART (Q1a, Q1b, Q1c, Q2a, Q2b, ... to the last part). One region per PART; split each question into separate regions for (a), (b), (c), etc. For each return id (e.g. Q1a), name (e.g. Question 1 (a)), pageRegions (x=0, width=595; y and height to cover that part only, with about 8–12pt vertical padding above and below so the box does not cut into adjacent questions). Set paper_finished: true when you have included the LAST part on the paper; set paper_finished: false if there are more parts on later pages. Return ONLY valid JSON: {\"regions\": [...], \"paper_finished\": true or false}. No markdown.";
        userContent = [
            { type: "text", text: userText },
            ...examImages,
        ];
    } else if (step === "metadata") {
        const ids = Array.isArray(regionIds) ? regionIds.filter((x: unknown) => typeof x === "string") as string[] : [];
        const idList = ids.length > 0 ? ids.join(", ") : "Q1, Q2, Q3, ... (infer from the paper)";
        systemPrompt = STEP_METADATA_SYSTEM;
        const logTableImages = toImageParts(logTablePageImages ?? [], 12);
        userContent = [
            {
                type: "text",
                text: `The questions on this exam are: ${idList}. Look at each question in the images and for each return id, tags (up to 3 from the allowed list, no duplicate tags), and log_table_page (booklet page number or null).${logTableImages.length > 0 ? " The following images are the Log Tables booklet—use them to set log_table_page." : ""} Return ONLY valid JSON with a \"regions\" array. No markdown.`,
            },
            ...examImages,
        ];
        if (logTableImages.length > 0) userContent.push(...logTableImages);
    } else if (step === "marking") {
        const ids = Array.isArray(regionIds) ? regionIds.filter((x: unknown) => typeof x === "string") as string[] : [];
        const missing = Array.isArray(missingMarkingIds) ? missingMarkingIds.filter((x: unknown) => typeof x === "string") as string[] : [];
        const idList = missing.length > 0
            ? `These questions still need marking_scheme_page_range: ${missing.join(", ")}. Fill in EVERY one — do not leave any empty.`
            : ids.length > 0
                ? ids.join(", ")
                : "Q1, Q2, Q3, ...";
        const markingSchemeImagesList = toImageParts(markingSchemeImages ?? [], 10);
        if (markingSchemeImagesList.length === 0) {
            res.status(400).json({ error: "markingSchemeImages required for step=marking" });
            return;
        }
        systemPrompt = STEP_MARKING_SYSTEM;
        userContent = [
            {
                type: "text",
                text: `Questions: ${idList}. The first set of images is the exam paper; the second set is the marking scheme. For EVERY question return id and marking_scheme_page_range (start, end). You MUST not leave any question without a marking_scheme_page_range. Return ONLY valid JSON with a \"regions\" array. No markdown.`,
            },
            ...examImages,
            { type: "text", text: "Marking scheme (next images):" },
            ...markingSchemeImagesList,
        ];
    } else if (step === "log_tables") {
        const ids = Array.isArray(regionIds) ? regionIds.filter((x: unknown) => typeof x === "string") as string[] : [];
        const idList = ids.length > 0 ? ids.join(", ") : "Q1, Q2, Q3, ...";
        const logTableImages = toImageParts(logTablePageImages ?? [], 12);
        if (logTableImages.length === 0) {
            res.status(400).json({ error: "logTablePageImages required for step=log_tables" });
            return;
        }
        systemPrompt = STEP_LOG_TABLES_SYSTEM;
        userContent = [
            {
                type: "text",
                text: `Questions: ${idList}. Look at each question in the exam images and at the Log Tables booklet (next images). For each question set log_table_page to the booklet page number ONLY if it needs a formula/table; otherwise null. Return ONLY valid JSON with a \"regions\" array. No markdown.`,
            },
            ...examImages,
            { type: "text", text: "Log Tables booklet:" },
            ...logTableImages,
        ];
    } else if (step === "tags") {
        const ids = Array.isArray(regionIds) ? regionIds.filter((x: unknown) => typeof x === "string") as string[] : [];
        const idList = ids.length > 0 ? ids.join(", ") : "Q1, Q2, Q3, ...";
        systemPrompt = STEP_TAGS_SYSTEM;
        userContent = [
            {
                type: "text",
                text: `Questions: ${idList}. For each question return id and tags (minimum 1 tag, maximum 3, from the allowed list). Every question must have at least one tag. Return ONLY valid JSON with a \"regions\" array. No markdown.`,
            },
            ...examImages,
        ];
    } else {
        const logTableImages = useExamOnly ? [] : toImageParts(logTablePageImages ?? [], 15);
        const markingSchemeImagesList = useExamOnly ? [] : toImageParts(markingSchemeImages ?? [], 10);
        const userText = useExamOnly ? EXTRACT_USER_EXAM_ONLY : EXTRACT_USER_FULL;
        userContent = [{ type: "text", text: userText }, ...examImages];
        if (logTableImages.length > 0) {
            userContent.push({ type: "text", text: `Log Tables booklet (${logTableImages.length} pages). Use to set log_table_page for each question.` });
            userContent.push(...logTableImages);
        }
        if (markingSchemeImagesList.length > 0) {
            const schemeNote = paperNumber === 2
                ? ` Marking scheme (${markingSchemeImagesList.length} pages). The PDF has Paper 1 first then Paper 2. This exam is Paper 2 — use ONLY the LATER pages (Paper 2 section) for marking_scheme_page_range.`
                : paperNumber === 1
                    ? ` Marking scheme (${markingSchemeImagesList.length} pages). The PDF has Paper 1 first then Paper 2. This exam is Paper 1 — use ONLY the EARLIER pages (Paper 1 section) for marking_scheme_page_range.`
                    : ` Marking scheme (${markingSchemeImagesList.length} pages). Match each region to the section that corresponds to the same paper (earlier = Paper 1, later = Paper 2). Set marking_scheme_page_range (start, end) for each region.`;
            userContent.push({ type: "text", text: schemeNote });
            userContent.push(...markingSchemeImagesList);
        }
        systemPrompt = useExamOnly ? EXTRACT_SYSTEM_MINIMAL : EXTRACT_SYSTEM;
    }

    const markingSchemeImagesListForNorm = step === "marking" ? toImageParts(markingSchemeImages ?? [], 10) : (useExamOnly ? [] : toImageParts(markingSchemeImages ?? [], 10));
    try {
        const response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://certchamps.com",
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent },
                ],
                max_tokens: 10000,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("OpenRouter extract error:", response.status, errText);
            res.status(502).json({ error: "AI extraction failed", details: errText });
            return;
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
        const content = data.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
            res.status(502).json({
                error: "No content in AI response",
                details: JSON.stringify(data, null, 2),
            });
            return;
        }

        // Parse JSON - strip markdown code fence if present
        let jsonStr = content.trim();
        const fence = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)```$/);
        if (fence) jsonStr = fence[1].trim();
        let parsed: { regions?: ExtractedRegion[]; paper_finished?: boolean };
        try {
            parsed = JSON.parse(jsonStr) as { regions?: ExtractedRegion[]; paper_finished?: boolean };
        } catch (parseErr) {
            console.error("extractQuestions JSON parse error:", parseErr);
            res.status(502).json({
                error: "AI returned invalid JSON",
                details: jsonStr,
                parseError: String(parseErr),
            });
            return;
        }
        const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];
        const VERTICAL_PADDING_PT = 10;
        const A4_HEIGHT_PT = 842;
        const applyVerticalPadding = (arr: unknown[]): PageRegion[] => {
            return (Array.isArray(arr) ? arr : []).map((p) => {
                const o = p && typeof p === "object" ? p as Record<string, unknown> : {};
                const page = Number(o.page ?? 1);
                const x = Number(o.x ?? 0);
                const y = Number(o.y ?? 0);
                const width = Number(o.width ?? 595);
                const height = Number(o.height ?? 150);
                if (!Number.isFinite(page) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
                    return { page: 1, x: 0, y: 0, width: 595, height: 150 };
                }
                const y2 = Math.max(0, y - VERTICAL_PADDING_PT);
                const bottom = Math.min(A4_HEIGHT_PT, y + height + VERTICAL_PADDING_PT);
                const height2 = Math.max(1, bottom - y2);
                return {
                    page: Math.max(1, Math.round(page)),
                    x: Math.max(0, Math.round(x)),
                    y: Math.round(y2),
                    width: Math.max(1, Math.round(width)),
                    height: Math.round(height2),
                };
            });
        };
        const dedupeTags = (tags: string[]): string[] => {
            const seen = new Set<string>();
            return tags.filter((t) => {
                if (seen.has(t)) return false;
                seen.add(t);
                return true;
            });
        };
        const normRange = (v: unknown): { start: number; end: number } | null => {
            if (!v || typeof v !== "object") return null;
            const o = v as Record<string, unknown>;
            // Accept { start, end } (strings or numbers)
            const startVal = o.start ?? o.startPage;
            const endVal = o.end ?? o.endPage;
            const pageVal = o.page;
            let s: number | null = null;
            let e: number | null = null;
            if (startVal != null && endVal != null) {
                s = Number(startVal);
                e = Number(endVal);
            } else if (pageVal != null) {
                const p = Number(pageVal);
                if (Number.isFinite(p) && p >= 1) {
                    s = p;
                    e = p;
                }
            } else if (startVal != null) {
                s = Number(startVal);
                e = Number.isFinite(s) && s >= 1 ? s : null;
            } else if (endVal != null) {
                e = Number(endVal);
                s = Number.isFinite(e) && e >= 1 ? e : null;
            }
            if (s != null && e != null && Number.isFinite(s) && Number.isFinite(e) && s >= 1 && e >= 1) {
                return { start: Math.min(s, e), end: Math.max(s, e) };
            }
            return null;
        };
        if (step === "regions") {
            const regions = rawRegions.map((r) => ({
                id: r.id ?? "Q1",
                name: r.name ?? "",
                pageRegions: applyVerticalPadding(Array.isArray(r.pageRegions) ? r.pageRegions : []),
                log_table_page: null as number | null,
                tags: [] as string[],
                marking_scheme_page_range: null as { start: number; end: number } | null,
            }));
            const paperFinished = parsed.paper_finished === true;
            res.status(200).json({ regions, step: "regions", paper_finished: paperFinished });
            return;
        }
        if (step === "metadata") {
            const regions = rawRegions.map((r) => ({
                id: r.id ?? "Q1",
                tags: dedupeTags(Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : []),
                log_table_page: typeof r.log_table_page === "number" ? r.log_table_page : null,
            }));
            res.status(200).json({ regions, step: "metadata" });
            return;
        }
        if (step === "marking") {
            const regions = rawRegions.map((r) => ({
                id: r.id ?? "Q1",
                marking_scheme_page_range: normRange(r.marking_scheme_page_range),
            }));
            res.status(200).json({ regions, step: "marking" });
            return;
        }
        if (step === "log_tables") {
            const regions = rawRegions.map((r) => ({
                id: r.id ?? "Q1",
                log_table_page: typeof r.log_table_page === "number" ? r.log_table_page : null,
            }));
            res.status(200).json({ regions, step: "log_tables" });
            return;
        }
        if (step === "tags") {
            const regions = rawRegions.map((r) => ({
                id: r.id ?? "Q1",
                tags: dedupeTags(Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : []),
            }));
            res.status(200).json({ regions, step: "tags" });
            return;
        }
        const hasMarkingScheme = markingSchemeImagesListForNorm.length > 0;
        const regions = rawRegions.map((r) => ({
            id: r.id ?? "Q1",
            name: r.name ?? "",
            pageRegions: applyVerticalPadding(Array.isArray(r.pageRegions) ? r.pageRegions : []),
            log_table_page: typeof r.log_table_page === "number" ? r.log_table_page : null,
            tags: dedupeTags(Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : []),
            marking_scheme_page_range: hasMarkingScheme ? normRange(r.marking_scheme_page_range) : null,
        }));
        res.status(200).json({ regions });
    } catch (err) {
        console.error("extractQuestions error:", err);
        const details = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "Failed to extract questions", details });
    }
});

// ======================== STRIPE PRO CHECKOUT ======================== //

const PRO_PRICE_EUR_CENTS = 2000; // €20.00

/** Create a Stripe Checkout Session for one-time Pro upgrade (€20). Expects POST with JSON body: { idToken, successUrl?, cancelUrl? } */
export const createProCheckout = functions.https.onRequest(
    {
        cors: true,
        secrets: ["STRIPE_SECRET_KEY"],
    },
    (req, res) => {
        corsMiddleware(req, res, async () => {
            if (req.method !== "POST") {
                res.status(405).json({ error: "Method not allowed" });
                return;
            }
            try {
                const stripeKey = process.env.STRIPE_SECRET_KEY;
                if (!stripeKey) {
                    console.error("Missing STRIPE_SECRET_KEY");
                    res.status(500).json({ error: "Server configuration error" });
                    return;
                }
                const { idToken, successUrl, cancelUrl } = req.body || {};
                if (!idToken) {
                    res.status(400).json({ error: "idToken is required" });
                    return;
                }
                let uid: string;
                try {
                    const decoded = await admin.auth().verifyIdToken(idToken);
                    uid = decoded.uid;
                } catch (e) {
                    console.error("Invalid idToken:", e);
                    res.status(401).json({ error: "Invalid or expired token" });
                    return;
                }
                const origin = req.headers.origin || "https://certchamps-a7527.web.app";
                const base = origin.replace(/\/$/, "");
                const success = successUrl || `${base}/#/user/manage-account?success=pro`;
                const cancel = cancelUrl || `${base}/#/user/manage-account?cancel=pro`;

                const stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
                const session = await stripe.checkout.sessions.create({
                    mode: "payment",
                    payment_method_types: ["card"],
                    line_items: [
                        {
                            quantity: 1,
                            price_data: {
                                currency: "eur",
                                unit_amount: PRO_PRICE_EUR_CENTS,
                                product_data: {
                                    name: "CertChamps Pro",
                                    description: "One-time upgrade to Pro account",
                                },
                            },
                        },
                    ],
                    client_reference_id: uid,
                    success_url: success,
                    cancel_url: cancel,
                });

                res.status(200).json({ url: session.url });
            } catch (err) {
                console.error("createProCheckout error:", err);
                res.status(500).json({ error: "Failed to create checkout session" });
            }
        });
    }
);

/** Stripe webhook: on checkout.session.completed, set user isPro in Firestore. Requires rawBody for signature verification (Cloud Functions may expose it as req.rawBody). */
export const stripeWebhook = functions.https.onRequest(
    {
        cors: false,
        secrets: ["STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"],
    },
    async (req, res) => {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret || !stripeKey) {
            console.error("Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
            res.status(500).end();
            return;
        }
        const sig = req.headers["stripe-signature"];
        if (!sig) {
            res.status(400).send("Missing stripe-signature");
            return;
        }
        const rawBody = (req as { rawBody?: Buffer }).rawBody ?? (typeof req.body === "string" ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body || {})));
        let event: Stripe.Event;
        try {
            event = Stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        } catch (e) {
            console.error("Stripe webhook signature verification failed:", e);
            res.status(400).send("Invalid signature");
            return;
        }
        if (event.type !== "checkout.session.completed") {
            res.status(200).send("OK");
            return;
        }
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.client_reference_id;
        if (!uid) {
            console.error("checkout.session.completed missing client_reference_id");
            res.status(200).send("OK");
            return;
        }
        try {
            await admin.firestore().doc(`user-data/${uid}`).set({ isPro: true }, { merge: true });
        } catch (e) {
            console.error("Failed to update user isPro:", e);
            res.status(500).end();
            return;
        }
        res.status(200).send("OK");
    }
);