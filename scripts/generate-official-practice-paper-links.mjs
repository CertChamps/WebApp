import { readFile, writeFile } from "node:fs/promises";

const archive = "https://www.examinations.ie/exammaterialarchive/";
const coversFile = new URL("../src/data/generatedPracticePaperCovers.ts", import.meta.url);
const outputFile = new URL("../src/data/generatedOfficialPracticePaperLinks.ts", import.meta.url);
const field = "MaterialArchive__noTable__";

function slug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formBody(year, cycle, subject = null) {
  const params = new URLSearchParams();
  params.set(`${field}cbv__AgreeCheck`, "");
  params.set(`${field}cbh__AgreeCheck`, "N");
  for (const [name, value] of [["ViewType", "exampapers"], ["YearSelect", String(year)], ["ExaminationSelect", cycle === "junior" ? "jc" : "lc"]]) {
    params.set(`${field}sbv__${name}`, value);
    params.set(`${field}sbh__${name}`, "id");
  }
  if (subject) {
    params.set(`${field}sbv__SubjectSelect`, subject);
    params.set(`${field}sbh__SubjectSelect`, "id");
  }
  return params;
}

async function subjectCodes(year, cycle) {
  let html = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${archive}?i=100.119.96.108.99`, { method: "POST", body: formBody(year, cycle) });
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) throw new Error(`SEC subject list failed: ${response.status}`);
      html = await response.text();
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  const select = html.match(/<select[^>]+SubjectSelect[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const codes = new Map();
  for (const match of select.matchAll(/<option value="(\d+)"[^>]*>([^<]+)<\/option>/g)) {
    codes.set(slug(match[2].replace(/&amp;/g, "&")), match[1].padStart(3, "0"));
  }
  return codes;
}

function subjectCode(codes, subject) {
  const aliases = {
    "applied-maths": ["applied-mathematics"],
    "home-economics": ["home-economics", "home-economics-s-and-s"],
    "irish": ["irish", "irish-t1", "gaeilge-chumarsaideach"],
  };
  const normalized = slug(subject);
  const candidates = [normalized, ...(aliases[normalized] ?? [])];
  return candidates.map((candidate) => codes?.get(candidate)).find(Boolean) ?? null;
}

function resolvedSubjectCode(codes, cycle, subject) {
  const archiveCode = subjectCode(codes, subject);
  if (archiveCode) return archiveCode;
  return ({
    "junior|history": "004",
    "leaving|religious-education": "223",
  })[`${cycle}|${slug(subject)}`] ?? null;
}

function decode(value) {
  return value.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]*>/g, "").trim();
}

async function archivePapers(year, cycle, subject) {
  const url = `${archive}?i=113.115.96.104.99.97.114.100`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { method: "POST", body: formBody(year, cycle, subject) });
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      if (!response.ok) return [];
      const html = await response.text();
      const rows = [];
      const pattern = /name='fileid' value='([^']+)'[\s\S]*?<TD class='materialbody'>([\s\S]*?)<\/TD>/gi;
      for (const match of html.matchAll(pattern)) {
        const file = match[1];
        if (/[A-Z]{2}\.pdf$/i.test(file)) rows.push({ file, label: decode(match[2]), url: `https://www.examinations.ie/archive/exampapers/${year}/${file}` });
      }
      return rows;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  return [];
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}

const covers = JSON.parse((await readFile(coversFile, "utf8")).replace(/^[\s\S]*?= /, "").replace(/;\s*$/, ""));
const allKeys = Object.keys(covers);
const missingOnly = process.argv.includes("--missing-only");
const existingLinks = missingOnly
  ? JSON.parse((await readFile(outputFile, "utf8")).replace(/^[\s\S]*?= /, "").replace(/;\s*$/, ""))
  : {};
const keys = missingOnly ? allKeys.filter((key) => !existingLinks[key]) : allKeys;
const codesByCycleYear = new Map();
const cycleYears = [...new Set(keys.map((key) => {
  const [cycle, , , year] = key.split("|");
  return `${cycle}|${year}`;
}))];

await mapLimit(cycleYears, 2, async (cycleYear) => {
  const [cycle, yearRaw] = cycleYear.split("|");
  try {
    codesByCycleYear.set(cycleYear, await subjectCodes(Number(yearRaw), cycle));
  } catch (error) {
    codesByCycleYear.set(cycleYear, new Map());
    console.warn(`Could not read ${cycle} ${yearRaw} subjects: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
});
console.log(`Read year-specific SEC subject codes for ${codesByCycleYear.size} examination years.`);
if (process.argv.includes("--list-subjects")) {
  const names = [...new Set([...codesByCycleYear.values()].flatMap((codes) => [...codes.keys()]))].sort();
  console.log(names.join("\n"));
  process.exit(0);
}

const groups = new Map();
for (const key of keys) {
  const [cycle, subject, level, yearRaw, paperRaw, paperType] = key.split("|");
  const code = resolvedSubjectCode(codesByCycleYear.get(`${cycle}|${yearRaw}`), cycle, subject);
  if (!code) continue;
  const groupKey = `${cycle}|${yearRaw}|${code}`;
  if (!groups.has(groupKey)) groups.set(groupKey, { cycle, year: Number(yearRaw), code });
}

const archiveResults = new Map();
let fetched = 0;
const selectedGroups = [...groups];
const groupLimit = Number(process.argv[2]) || selectedGroups.length;
console.log(`Prepared ${selectedGroups.length} year/subject archive queries.`);
await mapLimit(selectedGroups.slice(0, groupLimit), 3, async ([key, group]) => {
  archiveResults.set(key, await archivePapers(group.year, group.cycle, group.code));
  fetched += 1;
  if (fetched % 100 === 0) console.log(`Read ${fetched}/${Math.min(groupLimit, selectedGroups.length)} SEC archive pages`);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

const links = {};
const unresolved = [];

function rowPaperNumber(row, prefix) {
  const value = row.file.slice(prefix.length, prefix.length + 1);
  return /^\d$/.test(value) ? Number(value) : null;
}

function isDeferred(value) {
  return /de+f+er+e*d/i.test(value);
}

function selectRows(rows, { paper, paperType, prefix }) {
  const wantsDeferred = isDeferred(paperType);
  const typedRows = rows.filter((row) => isDeferred(`${row.label} ${row.file}`));
  const eligible = wantsDeferred ? typedRows : rows.filter((row) => !typedRows.includes(row));
  if (eligible.length === 0) return [];

  const exactNumber = eligible.filter((row) => rowPaperNumber(row, prefix) === paper);
  if (exactNumber.length > 0) return exactNumber;

  const labelNumber = eligible.filter((row) => new RegExp(`\\bpaper\\s*(?:no\\.?\\s*)?${paper}\\b`, "i").test(row.label));
  if (labelNumber.length > 0) return labelNumber;

  // A large part of the source catalogue splits one SEC PDF into Paper 1 and
  // Paper 2 question groups. SEC represents those combined files with 0.
  const combinedRows = eligible.filter((row) => rowPaperNumber(row, prefix) === 0);
  if (combinedRows.length > 0) return combinedRows;
  if (paper === 0) return eligible;
  // Before 2007, some filenames used the letter O where newer files use zero.
  if (eligible.every((row) => rowPaperNumber(row, prefix) === null)) return eligible;
  if (eligible.length === 1) return eligible;
  return [];
}

for (const key of keys) {
  const [cycle, subject, level, yearRaw, paperRaw, paperType] = key.split("|");
  const code = resolvedSubjectCode(codesByCycleYear.get(`${cycle}|${yearRaw}`), cycle, subject);
  const levelCode = ({ higher: "A", ordinary: "G", foundation: "B", common: "C" })[level.toLowerCase()];
  if (!code || !levelCode) {
    unresolved.push({ key, reason: !code ? "subject-code" : "level-code" });
    continue;
  }
  const paper = Number(paperRaw);
  if (![0, 1, 2].includes(paper)) {
    unresolved.push({ key, reason: "paper-number" });
    continue;
  }
  const prefix = `${cycle === "junior" ? "JC" : "LC"}${code}${levelCode}LP`;
  const candidates = (archiveResults.get(`${cycle}|${yearRaw}|${code}`) ?? [])
    .filter((row) => row.file.startsWith(prefix));
  const rows = selectRows(candidates, { paper, paperType, prefix });
  if (rows.length > 0) links[key] = rows.map(({ label, url }) => ({ label, url }));
  else unresolved.push({
    key,
    reason: candidates.length > 0 ? "variant-match" : "no-archive-row",
    candidates: candidates.map(({ file, label }) => ({ file, label })),
  });
}

async function urlExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

// The archive form occasionally omits a valid PDF row. Probe only known SEC
// filename shapes and keep a result only when the official URL returns 200.
await mapLimit([...unresolved], 3, async (entry) => {
  const [cycle, subject, level, yearRaw, paperRaw, paperType] = entry.key.split("|");
  if (paperType) return;
  const code = resolvedSubjectCode(codesByCycleYear.get(`${cycle}|${yearRaw}`), cycle, subject);
  const levelCode = ({ higher: "A", ordinary: "G", foundation: "B", common: "C" })[level.toLowerCase()];
  if (!code || !levelCode) return;

  const paper = Number(paperRaw);
  const prefix = `${cycle === "junior" ? "JC" : "LC"}${code}${levelCode}LP`;
  const stems = [`${prefix}${paper}00`, `${prefix}${paper}`];
  if (paper === 0 || (entry.candidates?.length ?? 0) === 0) {
    stems.push(`${prefix}000`, `${prefix}O00`);
  }
  const candidates = stems.flatMap((stem) => ["EV", "IV"].map((language) => ({
    language,
    url: `https://www.examinations.ie/archive/exampapers/${yearRaw}/${stem}${language}.pdf`,
  })));
  const urls = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];
  const found = [];
  for (const candidate of urls) {
    if (await urlExists(candidate.url)) found.push(candidate);
  }
  if (found.length === 0) return;

  const levelLabel = ({ higher: "Higher", ordinary: "Ordinary", foundation: "Foundation", common: "Common" })[level] ?? level;
  links[entry.key] = found.map(({ language, url }) => ({ label: `${levelLabel} Level (${language})`, url }));
  const index = unresolved.indexOf(entry);
  if (index >= 0) unresolved.splice(index, 1);
});

if (!process.argv[2] || missingOnly) {
  const outputLinks = missingOnly ? { ...existingLinks, ...links } : links;
  await writeFile(outputFile, `// Generated by scripts/generate-official-practice-paper-links.mjs\nexport const OFFICIAL_PRACTICE_PAPER_LINKS: Record<string, { label: string; url: string }[]> = ${JSON.stringify(outputLinks, null, 2)};\n`);
}
console.log(`Matched ${Object.keys(links).length} paper groups to SEC listings from ${fetched} archive pages.`);
const unresolvedReasons = Object.fromEntries(
  [...new Set(unresolved.map(({ reason }) => reason))]
    .map((reason) => [reason, unresolved.filter((entry) => entry.reason === reason).length])
);
console.log(`Unresolved ${unresolved.length}: ${JSON.stringify(unresolvedReasons)}`);
for (const reason of Object.keys(unresolvedReasons)) {
  const subjects = unresolved
    .filter((entry) => entry.reason === reason)
    .map((entry) => entry.key.split("|")[1])
    .reduce((counts, subject) => counts.set(subject, (counts.get(subject) ?? 0) + 1), new Map());
  const summary = [...subjects].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`${reason}: ${summary.map(([subject, count]) => `${subject}=${count}`).join(", ")}`);
}
if (missingOnly) {
  for (const entry of unresolved) {
    const candidates = (entry.candidates ?? []).map(({ file, label }) => `${file} (${label})`).join("; ");
    console.log(`${entry.reason}\t${entry.key}\t${candidates}`);
  }
}
