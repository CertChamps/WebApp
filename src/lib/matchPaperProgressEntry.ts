import { SUBJECT_ID_TO_BACKEND } from "../data/practiceHubSubjects";
import { normalizePaperLevel } from "../hooks/useExamPapers";

/** All known subject id spellings in the same equivalence class (hub slug ↔ Firestore ids). */
function subjectProgressCluster(id: string): Set<string> {
  const x = id.trim().toLowerCase();
  const out = new Set<string>([x]);
  for (const [hub, backs] of Object.entries(SUBJECT_ID_TO_BACKEND)) {
    const h = hub.toLowerCase();
    const bl = backs.map((b) => b.toLowerCase());
    if (x === h || bl.includes(x)) {
      out.add(h);
      bl.forEach((b) => out.add(b));
    }
  }
  return out;
}

/** True if two subject ids refer to the same Leaving Cert subject for progress purposes. */
export function progressSubjectsAlign(subjectA: string, subjectB: string): boolean {
  const ca = subjectProgressCluster(subjectA);
  const cb = subjectProgressCluster(subjectB);
  for (const s of ca) {
    if (cb.has(s)) return true;
  }
  return false;
}

export function progressLevelsMatch(levelA: string, levelB: string): boolean {
  return normalizePaperLevel(levelA) === normalizePaperLevel(levelB);
}

export function paperProgressEntryMatchesSubjectLevel(
  e: { subject: string; level: string },
  cardSubject: string,
  cardLevel: string
): boolean {
  return progressSubjectsAlign(e.subject, cardSubject) && progressLevelsMatch(e.level, cardLevel);
}
