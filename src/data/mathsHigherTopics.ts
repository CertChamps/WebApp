/**
 * Topics and SubTopics for Maths Higher Level (past papers / question tags).
 * Written to Firestore at: questions/leavingcert/subjects/maths/levels/higher
 */

/** Main topic categories (12). */
export const MATHS_HIGHER_TOPICS = [
  "Algebra",
  "Area and Volume",
  "Coordinate Geometry",
  "Complex Numbers",
  "Calculus",
  "Financial Maths",
  "Geometry",
  "Induction",
  "Probability",
  "Sequences and Series",
  "Statistics",
  "Trigonometry",
] as const;

/** Specific sub-topics (25). Matches the tag list: "Topic - SubTopic" or standalone. */
export const MATHS_HIGHER_SUB_TOPICS = [
  "Cubics",
  "Expressions and Factorising",
  "Inequalities",
  "Quadratics",
  "Simultaneous Equations",
  "Solving Equations",
  "Indices and Logs",
  "Area and Volume",
  "The Circle",
  "The Line",
  "Complex Numbers",
  "Differentiation",
  "Integration",
  "Functions",
  "Financial Maths",
  "Geometry",
  "Constructions and Proofs",
  "Induction",
  "Probability",
  "Sequences and Series",
  "Descriptive Statistics",
  "Inferential Statistics",
  "Z Scores",
  "Functions and Identities",
  "Triangles",
] as const;

export type MathsHigherTopic = (typeof MATHS_HIGHER_TOPICS)[number];
export type MathsHigherSubTopic = (typeof MATHS_HIGHER_SUB_TOPICS)[number];

/** Map each topic to its subtopics for the filter UI. */
export const TOPIC_TO_SUB_TOPICS: Record<string, string[]> = {
  Algebra: [
    "Cubics",
    "Expressions and Factorising",
    "Inequalities",
    "Quadratics",
    "Simultaneous Equations",
    "Solving Equations",
    "Indices and Logs",
  ],
  "Area and Volume": ["Area and Volume"],
  "Coordinate Geometry": ["The Circle", "The Line"],
  "Complex Numbers": ["Complex Numbers"],
  Calculus: ["Differentiation", "Integration", "Functions"],
  "Financial Maths": ["Financial Maths"],
  Geometry: ["Geometry", "Constructions and Proofs"],
  Induction: ["Induction"],
  Probability: ["Probability"],
  "Sequences and Series": ["Sequences and Series"],
  Statistics: ["Descriptive Statistics", "Inferential Statistics", "Z Scores"],
  Trigonometry: ["Functions and Identities", "Triangles"],
};

/** Main topic categories for Maths Ordinary Level. */
export const MATHS_ORDINARY_TOPICS = [
  "Algebra",
  "Area and Volume",
  "Coordinate Geometry",
  "Complex Numbers",
  "Counting",
  "Differentiation",
  "Financial Maths",
  "Functions",
  "Geometry",
  "Graphing Functions",
  "Probability",
  "Sequences and Series",
  "Statistics",
  "Trigonometry",
] as const;

/** Map each Maths Ordinary topic to its subtopics for the filter UI. */
export const MATHS_ORDINARY_TOPIC_TO_SUB_TOPICS: Record<string, string[]> = {
  Algebra: ["Equations", "Indices", "Number Systems"],
  "Area and Volume": [],
  "Coordinate Geometry": ["The Line", "The Circle"],
  "Complex Numbers": [],
  Counting: [],
  Differentiation: [],
  "Financial Maths": [],
  Functions: [],
  Geometry: ["Proofs and Constructions"],
  "Graphing Functions": [],
  Probability: [],
  "Sequences and Series": [],
  Statistics: [],
  Trigonometry: [],
};

/** Main topic categories for Physics Higher Level. */
export const PHYSICS_HIGHER_TOPICS = [
  "Exp. Qs. Mechanics",
  "Exp. Qs. Light",
  "Exp. Qs. Heat",
  "Exp. Qs. Sound",
  "Exp. Qs. Electricity",
  "Particle Physics",
  "Applied Electricity",
  "Mechanics",
  "Magnetism",
  "Waves",
  "Light",
  "Electricity",
  "Heat",
  "Modern Physics",
] as const;

/** Map each Physics Higher topic to its subtopics for the filter UI. */
export const PHYSICS_HIGHER_TOPIC_TO_SUB_TOPICS: Record<string, string[]> = {
  "Exp. Qs. Mechanics": [],
  "Exp. Qs. Light": [],
  "Exp. Qs. Heat": [],
  "Exp. Qs. Sound": [],
  "Exp. Qs. Electricity": [],
  "Particle Physics": [],
  "Applied Electricity": [],
  Mechanics: [
    "Acceleration",
    "Force, Mass & Momentum",
    "Circular Motion",
    "Pressure, Gravity & Moments",
    "Simple Harmonic Motion",
    "Speed, Displacement, Velocity",
    "Vectors & Scalars",
    "Work, Energy & Power",
  ],
  Magnetism: ["Magnets & Magnetic Fields", "Electromagnetic Induction"],
  Waves: ["Vibration & Sound", "Waves & Wave Motion"],
  Light: ["Reflection & Mirrors", "Refraction & Lenses"],
  Electricity: [
    "Applied Electricity",
    "Current & Charge",
    "Electric Circuits",
    "Potential Difference & Capacitance",
    "Resistance",
    "Semiconductors",
    "Static Electricity",
  ],
  Heat: ["Heat & Heat Transfer", "Temperature & Thermometers"],
  "Modern Physics": [
    "Nuclear Energy",
    "The Atom, Nucleus & Radioactivity",
    "The Electron",
  ],
};

export type PastPaperTopicScope = {
  topics: readonly string[];
  topicToSubTopics: Record<string, string[]>;
};

/**
 * Topic scope keyed by "subject::level".
 * Add new scopes here, e.g. "maths::ordinary", to drive Questions page topic filtering.
 */
export const PAST_PAPER_TOPIC_SCOPES: Record<string, PastPaperTopicScope> = {
  "maths::higher": {
    topics: MATHS_HIGHER_TOPICS,
    topicToSubTopics: TOPIC_TO_SUB_TOPICS,
  },
  "maths::ordinary": {
    topics: MATHS_ORDINARY_TOPICS,
    topicToSubTopics: MATHS_ORDINARY_TOPIC_TO_SUB_TOPICS,
  },
  "physics::higher": {
    topics: PHYSICS_HIGHER_TOPICS,
    topicToSubTopics: PHYSICS_HIGHER_TOPIC_TO_SUB_TOPICS,
  },
};

function normalizeLevel(level: string | undefined | null): string {
  const raw = String(level ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "hl" || raw === "higher" || raw === "higher-level" || raw === "higher level") {
    return "higher";
  }
  if (raw === "ol" || raw === "ordinary" || raw === "ordinary-level" || raw === "ordinary level") {
    return "ordinary";
  }
  if (raw === "fd" || raw === "foundation" || raw === "foundation-level" || raw === "foundation level") {
    return "foundation";
  }
  return raw;
}

export function getPastPaperTopicScope(
  subject: string | undefined | null,
  level: string | undefined | null
): PastPaperTopicScope | null {
  const s = String(subject ?? "").trim().toLowerCase();
  const l = normalizeLevel(level);
  if (!s || !l) return null;
  return PAST_PAPER_TOPIC_SCOPES[`${s}::${l}`] ?? null;
}
