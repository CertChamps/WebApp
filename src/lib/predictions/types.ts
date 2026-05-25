export type TopicForecast = {
  topic: string;
  likelihood: "high" | "medium" | "low";
  /** Share of total weighted topic appearances (0–100). */
  percent: number;
  reason: string;
};

export type PredictionContentType = "pastpaper" | "image";

export type PredictedQuestionSelection = {
  slot: number;
  displayName: string;
  reason: string;
  /** Past-paper prediction source. */
  sourcePaperId?: string;
  sourceQuestionId?: string;
  /** Image prediction source. */
  sourceTopic?: string;
  imageKey?: string;
};

export type PredictedPaperBlueprint = {
  contentType: PredictionContentType;
  label: string;
  year: number;
  /** Only for past-paper predictions. */
  paperNumber?: 1 | 2;
  summary: string;
  topicForecast: TopicForecast[];
  selections: PredictedQuestionSelection[];
};

export type GeneratePredictionRequest = {
  subject: string;
  level: string;
  targetYear?: number;
  /** Required for past-paper subjects; ignored for image subjects. */
  paperNumber?: 1 | 2;
  contentType?: PredictionContentType;
};
