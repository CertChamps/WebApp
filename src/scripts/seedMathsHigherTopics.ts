/**
 * One-time seed: write Maths Higher Level Topics and SubTopics to Firestore.
 *
 * Target: questions/leavingcert/subjects/maths/levels/higher
 * Fields set: topics (string[]), subTopics (string[]) — merge: true so existing fields (e.g. sections) are kept.
 *
 * Run once from browser console after app is loaded:
 *   import('./scripts/seedMathsHigherTopics').then(m => m.seedMathsHigherTopics())
 *
 * Or call seedMathsHigherTopics() from a temporary admin button.
 */
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { MATHS_HIGHER_TOPICS, MATHS_HIGHER_SUB_TOPICS } from "../data/mathsHigherTopics";

const MATHS_HIGHER_LEVEL_PATH = ["questions", "leavingcert", "subjects", "maths", "levels", "higher"] as const;

export async function seedMathsHigherTopics(): Promise<void> {
  const ref = doc(db, ...MATHS_HIGHER_LEVEL_PATH);
  const topics = [...MATHS_HIGHER_TOPICS];
  const subTopics = [...MATHS_HIGHER_SUB_TOPICS];
  // Always include sections: ["papers"] so useExamPapers() finds this level and loads the papers collection
  await setDoc(ref, { topics, subTopics, sections: ["papers"] }, { merge: true });
  console.log("Maths Higher Level updated:", { topics: topics.length, subTopics: subTopics.length });
}
