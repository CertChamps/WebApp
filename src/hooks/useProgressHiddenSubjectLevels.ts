import { useCallback, useEffect, useState } from "react";
import type { PaperProgressEntry } from "./usePaperProgress";
import { normalizePaperLevel } from "./useExamPapers";
import { paperProgressEntryMatchesSubjectLevel } from "../lib/matchPaperProgressEntry";

const STORAGE_KEY_V1 = "certchamps.progress.hiddenSubjectLevels.v1";
const STORAGE_KEY_V2 = "certchamps.progress.hiddenSubjectLevels.v2";

export function progressSubjectLevelKey(subject: string, level: string): string {
  const normLevel = normalizePaperLevel(level) || level.trim().toLowerCase();
  return `${subject.trim().toLowerCase()}||${normLevel}`;
}

/** Stable string of all paper-progress rows for this subject+level (any change → tile can show again). */
export function computeProgressFingerprintForSubjectLevel(
  subject: string,
  level: string,
  entries: PaperProgressEntry[]
): string {
  const relevant = entries.filter((e) =>
    paperProgressEntryMatchesSubjectLevel(e, subject, level)
  );
  relevant.sort((a, b) => a.paperId.localeCompare(b.paperId, undefined, { numeric: true }));
  return relevant
    .map(
      (e) =>
        `${e.paperId}:${e.totalQuestions}:${e.lastUpdated}:${[...e.completedQuestions].sort().join(",")}`
    )
    .join("|");
}

function readV2Map(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && k.includes("||") && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persistV2Map(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("progress-hidden-subjects-changed"));
}

function migrateV1IfNeeded(entries: PaperProgressEntry[]): Record<string, string> {
  if (entries.length === 0) return readV2Map();
  const v1raw = localStorage.getItem(STORAGE_KEY_V1);
  if (!v1raw) return readV2Map();
  try {
    const arr = JSON.parse(v1raw) as unknown;
    if (!Array.isArray(arr)) return readV2Map();
    const merged = { ...readV2Map() };
    for (const key of arr) {
      if (typeof key !== "string" || !key.includes("||")) continue;
      const idx = key.indexOf("||");
      const sub = key.slice(0, idx);
      const lev = key.slice(idx + 2);
      merged[key] = computeProgressFingerprintForSubjectLevel(sub, lev, entries);
    }
    localStorage.removeItem(STORAGE_KEY_V1);
    persistV2Map(merged);
    return merged;
  } catch {
    return readV2Map();
  }
}

/** Drop hidden keys whose saved fingerprint no longer matches (user made progress on that subject). */
function reconcileHiddenMap(
  map: Record<string, string>,
  entries: PaperProgressEntry[]
): Record<string, string> {
  const next = { ...map };
  let changed = false;
  for (const [key, fpAtHide] of Object.entries(map)) {
    const idx = key.indexOf("||");
    if (idx < 1) continue;
    const sub = key.slice(0, idx);
    const lev = key.slice(idx + 2);
    const current = computeProgressFingerprintForSubjectLevel(sub, lev, entries);
    if (current !== fpAtHide) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? next : map;
}

/** Hides tile until paper-progress for this subject+level changes (new work / completions). */
export function hideSubjectLevelFromProgressList(
  subject: string,
  level: string,
  entries: PaperProgressEntry[]
): void {
  const key = progressSubjectLevelKey(subject, level);
  const fp = computeProgressFingerprintForSubjectLevel(subject, level, entries);
  const map = { ...readV2Map(), [key]: fp };
  persistV2Map(map);
}

export function useProgressHiddenSubjectLevelKeys(
  progressEntries: PaperProgressEntry[]
): Set<string> {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set(Object.keys(readV2Map())));

  const syncFromStorage = useCallback(() => {
    const migrated = migrateV1IfNeeded(progressEntries);
    const reconciled = reconcileHiddenMap(migrated, progressEntries);
    if (JSON.stringify(reconciled) !== JSON.stringify(migrated)) {
      persistV2Map(reconciled);
    }
    setHiddenKeys(new Set(Object.keys(reconciled)));
  }, [progressEntries]);

  useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage]);

  useEffect(() => {
    const onStorage = () => syncFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener("progress-hidden-subjects-changed", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("progress-hidden-subjects-changed", onStorage);
    };
  }, [syncFromStorage]);

  return hiddenKeys;
}
