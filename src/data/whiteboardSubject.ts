/** Lightweight subject persistence for whiteboards — kept separate so the app shell
 *  (SessionTracker) does not pull in the full whiteboards data module. */

const LAST_SUBJECT_KEY = "whiteboards-last-subject";
export const WHITEBOARDS_SUBJECT_CHANGED_EVENT = "whiteboards-subject-changed";

export function getLastWhiteboardsSubject(): string | null {
  try {
    const v = localStorage.getItem(LAST_SUBJECT_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setLastWhiteboardsSubject(subjectId: string | null): void {
  try {
    if (subjectId) localStorage.setItem(LAST_SUBJECT_KEY, subjectId);
    else localStorage.removeItem(LAST_SUBJECT_KEY);
    window.dispatchEvent(new Event(WHITEBOARDS_SUBJECT_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
