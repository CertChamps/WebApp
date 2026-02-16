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
