#!/usr/bin/env node

const project = "certchamps-a7527";
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const token = process.env.FIREBASE_ACCESS_TOKEN?.trim();
const apply = process.argv.includes("--apply");
if (!token) throw new Error("FIREBASE_ACCESS_TOKEN is required");

const headers = { Authorization: `Bearer ${token}` };
const value = (doc, key) => doc.fields?.[key]?.stringValue ?? "";
const array = (doc, key) => (doc.fields?.[key]?.arrayValue?.values ?? []).map((item) => item.stringValue).filter(Boolean);
const enc = (text) => ({ stringValue: text });

function typeFor(doc) {
  const existing = value(doc, "resourceType");
  const values = [existing, ...array(doc, "resourceTypes")];
  if (["Revision Notes", "Sample Answer", "Lesson", "Flashcards"].includes(existing)) return existing;
  if (values.includes("Sample Answers")) return "Sample Answer";
  if (values.includes("Flashcards")) return "Flashcards";
  if (values.includes("Notes")) return "Revision Notes";
  if (values.includes("Videos")) return "Lesson";
  const text = `${value(doc, "title")} ${value(doc, "description")} ${value(doc, "websiteUrl")}`.toLowerCase();
  if (/sample answer|model answer|essay/.test(text)) return "Sample Answer";
  if (/quizlet|flashcard/.test(text)) return "Flashcards";
  if (/youtube|youtu\.be|vimeo|video|screencast/.test(text)) return "Lesson";
  return "Revision Notes";
}

function formatFor(doc) {
  const source = value(doc, "resourceSource");
  if (["pdf", "document"].includes(source)) return "Document";
  if (source === "image") return "Image";
  const url = value(doc, "websiteUrl");
  return /(?:youtube\.com|youtu\.be|vimeo\.com|\.mp4(?:\?|$)|\.webm(?:\?|$))/i.test(url) ? "Video" : "Website";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error?.message ?? "request failed"}`);
  return body;
}

const documents = [];
let cursor = "";
do {
  const url = new URL(`${root}/discover-notes`);
  url.searchParams.set("pageSize", "300");
  if (cursor) url.searchParams.set("pageToken", cursor);
  const page = await fetchJson(url);
  documents.push(...(page.documents ?? []));
  cursor = page.nextPageToken ?? "";
} while (cursor);

const approved = documents.filter((doc) => value(doc, "moderationStatus") === "approved");
const changes = approved.map((doc) => ({
  doc,
  type: typeFor(doc),
  format: formatFor(doc),
})).filter(({ doc, type, format }) =>
  value(doc, "resourceType") !== type
  || value(doc, "formatType") !== format
  || JSON.stringify(array(doc, "resourceTypes")) !== JSON.stringify([type])
);

console.table(changes.map(({ doc, type, format }) => ({
  id: doc.name.split("/").pop(),
  title: value(doc, "title"),
  from: value(doc, "resourceType"),
  type,
  format,
})).slice(0, 25));

if (apply) {
  for (const { doc, type, format } of changes) {
    const url = new URL(`https://firestore.googleapis.com/v1/${doc.name}`);
    for (const field of ["resourceType", "resourceTypes", "formatType"]) url.searchParams.append("updateMask.fieldPaths", field);
    await fetchJson(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        resourceType: enc(type),
        resourceTypes: { arrayValue: { values: [enc(type)] } },
        formatType: enc(format),
      } }),
    });
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", approved: approved.length, changes: changes.length }));
