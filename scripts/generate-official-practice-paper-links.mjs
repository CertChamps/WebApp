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
  const response = await fetch(`${archive}?i=100.119.96.108.99`, { method: "POST", body: formBody(year, cycle) });
  if (!response.ok) throw new Error(`SEC subject list failed: ${response.status}`);
  const html = await response.text();
  const select = html.match(/<select[^>]+SubjectSelect[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const codes = new Map();
  for (const match of select.matchAll(/<option value="(\d+)"[^>]*>([^<]+)<\/option>/g)) {
    codes.set(slug(match[2].replace(/&amp;/g, "&")), match[1].padStart(3, "0"));
  }
  return codes;
}

function subjectCode(codes, subject) {
  const aliases = {
    "applied-maths": "applied-mathematics",
    "design-and-communication-graphics": "design-and-communication-graphics",
    "history-later-modern": "history",
    "home-economics": "home-economics-s-and-s",
    "physics-and-chemistry": "physics-and-chemistry",
  };
  const normalized = slug(subject);
  return codes.get(aliases[normalized] ?? normalized)
    ?? (normalized === "history-early-modern" ? codes.get("history-early-modern") : null)
    ?? null;
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
        if (/EV\.pdf$/i.test(file)) rows.push({ file, label: decode(match[2]), url: `https://www.examinations.ie/archive/exampapers/${year}/${file}` });
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
const keys = Object.keys(covers);
const years = [...new Set(keys.map((key) => Number(key.split("|")[3])))].sort((a, b) => b - a);
const cycles = ["leaving", "junior"];
const codesByCycle = new Map();

for (const cycle of cycles) {
  const codes = new Map();
  for (const year of [years[0], 2023, 2019, 2015, 2010]) {
    try {
      for (const [name, code] of await subjectCodes(year, cycle)) codes.set(name, code);
    } catch (error) {
      console.warn(`Could not read ${cycle} ${year} subjects: ${error.message}`);
    }
  }
  codesByCycle.set(cycle, codes);
  console.log(`${cycle}: ${codes.size} SEC subjects`);
}

const groups = new Map();
for (const key of keys) {
  const [cycle, subject, level, yearRaw, paperRaw, paperType] = key.split("|");
  if (paperType) continue;
  const code = subjectCode(codesByCycle.get(cycle), subject);
  if (!code) continue;
  const groupKey = `${cycle}|${yearRaw}|${code}`;
  if (!groups.has(groupKey)) groups.set(groupKey, { cycle, year: Number(yearRaw), code });
}

const archiveResults = new Map();
let fetched = 0;
const selectedGroups = [...groups];
const groupLimit = Number(process.argv[2]) || selectedGroups.length;
await mapLimit(selectedGroups.slice(0, groupLimit), 2, async ([key, group]) => {
  archiveResults.set(key, await archivePapers(group.year, group.cycle, group.code));
  fetched += 1;
  if (fetched % 100 === 0) console.log(`Read ${fetched}/${Math.min(groupLimit, selectedGroups.length)} SEC archive pages`);
  await new Promise((resolve) => setTimeout(resolve, 750));
});

const links = {};
for (const key of keys) {
  const [cycle, subject, level, yearRaw, paperRaw, paperType] = key.split("|");
  if (paperType) continue;
  const code = subjectCode(codesByCycle.get(cycle), subject);
  const levelCode = ({ higher: "A", ordinary: "G", foundation: "B", common: "C" })[level.toLowerCase()];
  if (!code || !levelCode) continue;
  const paper = Number(paperRaw);
  if (![0, 1, 2].includes(paper)) continue;
  const prefix = `${cycle === "junior" ? "JC" : "LC"}${code}${levelCode}LP`;
  const rows = (archiveResults.get(`${cycle}|${yearRaw}|${code}`) ?? []).filter((row) => {
    if (!row.file.startsWith(prefix)) return false;
    const number = Number(row.file.slice(prefix.length, prefix.length + 1));
    return number === paper;
  });
  if (rows.length > 0) links[key] = rows.map(({ label, url }) => ({ label, url }));
}

if (!process.argv[2]) {
  await writeFile(outputFile, `// Generated by scripts/generate-official-practice-paper-links.mjs\nexport const OFFICIAL_PRACTICE_PAPER_LINKS: Record<string, { label: string; url: string }[]> = ${JSON.stringify(links, null, 2)};\n`);
}
console.log(`Matched ${Object.keys(links).length} paper groups to SEC listings from ${fetched} archive pages.`);
