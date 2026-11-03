import { mkdir, rm, writeFile, access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";

const PROJECT_ID = "certchamps-a7527";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DATASET_ROOT = "https://huggingface.co/datasets/ash12321/exam-papers/resolve/main";
const METADATA_URL = `${DATASET_ROOT}/metadata.json`;
const workspace = process.cwd();
const outputRoot = path.join(workspace, "public", "practice-paper-covers");
const generatedFile = path.join(workspace, "src", "data", "generatedPracticePaperCovers.ts");
const tempRoot = path.join(os.tmpdir(), "certchamps-practice-paper-covers");

function slug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(level|certificate|cycle)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function subjectKey(value) {
  const key = slug(value);
  const aliases = {
    maths: "mathematics",
    "applied-maths": "applied-mathematics",
    "design-communication-graphics": "design-and-communication-graphics",
  };
  return aliases[key] ?? key;
}

function levelKey(value) {
  return slug(value)
    .replace(/-level$/, "")
    .replace(/^higher$/, "higher")
    .replace(/^ordinary$/, "ordinary")
    .replace(/^foundation$/, "foundation")
    .replace(/^common$/, "common");
}

function fieldValue(field) {
  if (!field) return null;
  if (field.integerValue != null) return Number(field.integerValue);
  if (field.stringValue != null) return field.stringValue;
  return null;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) return "";
  return response.text();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}) {
  let response;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    response = await fetch(url, options);
    if (response.status !== 429 && response.status < 500) return response;
    await response.body?.cancel().catch(() => undefined);
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 1_000 * (2 ** attempt));
    await wait(delay);
  }
  return response;
}

async function getDocument(documentPath) {
  return fetchJson(`${FIRESTORE_BASE}/${documentPath}`);
}

async function listDocuments(collectionPath, fieldPaths = []) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`${FIRESTORE_BASE}/${collectionPath}`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    for (const fieldPath of fieldPaths) url.searchParams.append("mask.fieldPaths", fieldPath);
    const payload = await fetchJson(url);
    documents.push(...(payload.documents ?? []));
    pageToken = payload.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

async function catalogueGroups(cycle, root) {
  const rootDocument = await getDocument(`questions/${root}`);
  const subjects = rootDocument.fields?.sections?.arrayValue?.values
    ?.map((entry) => entry.stringValue)
    .filter(Boolean) ?? [];
  const groups = [];

  for (const subject of subjects) {
    const subjectDocument = await getDocument(`questions/${root}/subjects/${encodeURIComponent(subject)}`);
    const levels = subjectDocument.fields?.sections?.arrayValue?.values
      ?.map((entry) => entry.stringValue)
      .filter(Boolean) ?? [];

    for (const level of levels) {
      const questions = await listDocuments(
        `questions/${root}/subjects/${encodeURIComponent(subject)}/levels/${encodeURIComponent(level)}/questions`,
        ["year", "paper", "`paper type`"]
      ).catch(() => []);
      const seen = new Set();
      for (const question of questions) {
        const year = Number(fieldValue(question.fields?.year));
        if (!Number.isInteger(year) || year < 2000) continue;
        const paperValue = Number(fieldValue(question.fields?.paper));
        const paper = paperValue === 1 || paperValue === 2 ? paperValue : 0;
        const paperType = String(fieldValue(question.fields?.["paper type"]) ?? "").trim();
        const key = `${year}|${paper}|${paperType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ cycle, root, subject, level, year, paper, paperType });
      }
    }
  }
  return groups;
}

function datasetCycle(entry) {
  return /Junior Cert/i.test(entry.dest_path ?? "") ? "junior" : "leaving";
}

function selectSource(group, metadata) {
  // The dataset currently contains standard public papers only. Do not present
  // a standard cover as though it were a deferred or sample paper.
  if (group.paperType) return null;
  const exact = metadata.filter((entry) =>
    entry.material_type === "exampapers" &&
    entry.version === "EV" &&
    datasetCycle(entry) === group.cycle &&
    Number(entry.year) === group.year &&
    subjectKey(entry.subject_name) === subjectKey(group.subject) &&
    levelKey(entry.level) === levelKey(group.level)
  );
  if (exact.length === 0) return null;

  if (group.paper === 1 || group.paper === 2) {
    const paperMatch = exact.find((entry) => Number(entry.paper) === group.paper);
    if (paperMatch) return paperMatch;
  }
  const unnumbered = exact.find((entry) => Number(entry.paper) === 0);
  return unnumbered ?? (exact.length === 1 ? exact[0] : exact.find((entry) => Number(entry.paper) === 1) ?? null);
}

function betterExamsSubjectSlug(subject) {
  const aliases = {
    "applied-maths": "applied-mathematics",
    engineering: "engineering-27",
    "history-later-modern": "history",
    "home-economics": "home-economics-s-and-s",
    music: "music-67",
    "religious-education": "religious-education-220",
    technology: "technology-65",
  };
  return aliases[subject] ?? subject;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseBetterExamsLinks(html) {
  const links = [];
  const pattern = /href="([^"]+\/(?:exam-papers|deferred-exams|sample-exam-papers|sample-papers)\/[^"#?]+\.pdf)"[^>]*>([^<]+)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = decodeHtml(match[1]);
    const label = decodeHtml(match[2]).replace(/<!--.*?-->/g, "").trim();
    if (!/\((?:EV|BV|IV)\)/i.test(label)) continue;
    links.push({ href, label });
  }
  return links;
}

function selectBetterExamsLink(group, links) {
  const expectedLevel = `${levelKey(group.level)} level`.replace(/^common level$/, "common level");
  const type = group.paperType.toUpperCase();
  const candidates = links.filter((link) => {
    const label = link.label.toLowerCase();
    const href = link.href.toLowerCase();
    if (!label.includes(expectedLevel)) return false;
    if (type === "DEFFERED") return href.includes("deferred-exams");
    if (type === "SAMPLE") return href.includes("sample-exam-papers") || href.includes("sample-papers") || label.includes("sample");
    return href.includes("/exam-papers/") && !href.includes("deferred") && !label.includes("sample");
  });
  if (candidates.length === 0) return null;
  const preferredLanguage = candidates.filter((link) => /\((?:EV|BV)\)/i.test(link.label));
  const available = preferredLanguage.length > 0 ? preferredLanguage : candidates;

  if (group.paper === 1 || group.paper === 2) {
    const word = group.paper === 1 ? "one" : "two";
    const numbered = available.find((link) =>
      new RegExp(`paper(?:-|\\s)(?:${word}|${group.paper})(?:-|\\s|/)`, "i").test(`${link.href} ${link.label}`)
    );
    if (numbered) return numbered;
  }
  const unnumbered = available.find((link) => !/paper(?:-|\s)(?:one|two|1|2)(?:-|\s|\/)/i.test(`${link.href} ${link.label}`));
  return unnumbered ?? available[0];
}

async function betterExamsSources(groups) {
  const pages = new Map();
  for (const group of groups) {
    const key = [group.cycle, group.subject, group.year].join("|");
    if (!pages.has(key)) pages.set(key, { group, links: [] });
  }
  const entries = [...pages.entries()];
  await mapLimit(entries, 6, async ([, page], index) => {
    const { group } = page;
    const certificate = group.cycle === "junior" ? "junior-cert" : "leaving-cert";
    const subject = betterExamsSubjectSlug(group.subject);
    const url = `https://www.betterexams.ie/${certificate}/${subject}/${group.year}`;
    page.links = parseBetterExamsLinks(await fetchText(url));
    if ((index + 1) % 50 === 0) console.log(`Checked ${index + 1}/${entries.length} archive pages`);
  });

  const sources = new Map();
  for (const group of groups) {
    const page = pages.get([group.cycle, group.subject, group.year].join("|"));
    const link = selectBetterExamsLink(group, page?.links ?? []);
    if (!link) continue;
    const key = [group.cycle, group.subject, group.level, group.year, group.paper, group.paperType].join("|");
    sources.set(key, { url: new URL(link.href, "https://www.betterexams.ie").href });
  }
  return sources;
}

function datasetPath(entry) {
  if (entry.url) return entry.url;
  const directory = datasetCycle(entry) === "junior" ? "junior_cert" : "leaving_cert";
  const encodedName = entry.clean_filename.split("/").map(encodeURIComponent).join("/");
  return `${DATASET_ROOT}/${directory}/exam_papers/${encodedName}?download=true`;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetchWithRetry(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  if (url.includes("betterexams.ie")) await wait(750);
}

async function renderCover(pdfPath, outputPrefix) {
  await new Promise((resolve, reject) => {
    const child = spawn("pdftoppm", [
      "-f", "1", "-l", "1", "-singlefile", "-jpeg",
      "-jpegopt", "quality=76,optimize=y,progressive=y",
      "-scale-to-x", "260", "-scale-to-y", "-1",
      pdfPath, outputPrefix,
    ], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pdftoppm exited ${code}`)));
  });
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  console.log("Reading Practice Hub catalogue…");
  const [metadata, leavingGroups, juniorGroups] = await Promise.all([
    fetchJson(METADATA_URL),
    catalogueGroups("leaving", "leavingcert"),
    catalogueGroups("junior", "juniorcert"),
  ]);
  const groups = [...leavingGroups, ...juniorGroups];
  const initial = groups.map((group) => ({ group, source: selectSource(group, metadata) }));
  const initialUnmatched = initial.filter((item) => !item.source).map((item) => item.group);
  console.log(`Checking the comprehensive archive for ${initialUnmatched.length} remaining groups…`);
  const fallbackSources = await betterExamsSources(initialUnmatched);
  const matched = initial
    .map(({ group, source }) => ({
      group,
      source: source ?? fallbackSources.get([group.cycle, group.subject, group.level, group.year, group.paper, group.paperType].join("|")) ?? null,
    }))
    .filter((item) => item.source);
  const matchedKeys = new Set(matched.map(({ group }) => [group.cycle, group.subject, group.level, group.year, group.paper, group.paperType].join("|")));
  const unmatched = groups.filter((group) => !matchedKeys.has([group.cycle, group.subject, group.level, group.year, group.paper, group.paperType].join("|")));
  const unmatchedStandard = unmatched.filter((group) => !group.paperType);
  const unmatchedVariants = unmatched.filter((group) => group.paperType);
  const variantCounts = [...unmatchedVariants.reduce((counts, group) => {
    counts.set(group.paperType, (counts.get(group.paperType) ?? 0) + 1);
    return counts;
  }, new Map()).entries()];
  console.log(`Matched ${matched.length} of ${groups.length} paper groups.`);
  console.log(`${unmatchedStandard.length} standard papers and ${unmatchedVariants.length} variants are unmatched.`);
  if (variantCounts.length > 0) console.log(`Unmatched variants: ${variantCounts.map(([name, count]) => `${name}=${count}`).join(", ")}`);

  await mkdir(outputRoot, { recursive: true });
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  const coverMap = {};
  let completed = 0;

  await mapLimit(matched, 2, async ({ group, source }) => {
    const paperType = slug(group.paperType) || "standard";
    const fileName = `${group.year}-${group.paper}-${paperType}.jpg`;
    const relativeDirectory = path.join(group.cycle, group.subject, group.level);
    const outputDirectory = path.join(outputRoot, relativeDirectory);
    const outputPath = path.join(outputDirectory, fileName);
    await mkdir(outputDirectory, { recursive: true });

    try {
      if (!(await exists(outputPath))) {
        const tempName = `${group.cycle}-${slug(group.subject)}-${slug(group.level)}-${group.year}-${group.paper}-${paperType}`;
        const pdfPath = path.join(tempRoot, `${tempName}.pdf`);
        await download(datasetPath(source), pdfPath);
        await renderCover(pdfPath, outputPath.replace(/\.jpg$/i, ""));
        await rm(pdfPath, { force: true });
      }
    } catch (error) {
      console.warn(`Skipped ${group.cycle}/${group.subject}/${group.level}/${group.year}: ${error.message}`);
      completed += 1;
      return;
    }

    const mapKey = [group.cycle, group.subject, group.level, group.year, group.paper, group.paperType].join("|");
    coverMap[mapKey] = `/${path.relative(path.join(workspace, "public"), outputPath).split(path.sep).join("/")}`;
    completed += 1;
    if (completed % 25 === 0 || completed === matched.length) console.log(`Prepared ${completed}/${matched.length} covers`);
  });

  const generated = `// Generated by scripts/generate-practice-paper-covers.mjs\n` +
    `export const PRACTICE_PAPER_COVERS: Record<string, string> = ${JSON.stringify(coverMap, null, 2)};\n`;
  await writeFile(generatedFile, generated, "utf8");
  await rm(tempRoot, { recursive: true, force: true });

  if (unmatchedStandard.length > 0) {
    console.log("Unmatched standard paper groups:");
    for (const group of unmatchedStandard.slice(0, 100)) {
      console.log(`  ${group.cycle}: ${group.subject} / ${group.level} / ${group.year} / paper ${group.paper}`);
    }
  }
}

main().catch(async (error) => {
  console.error(error);
  await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  process.exitCode = 1;
});
