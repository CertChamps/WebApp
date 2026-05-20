import { generatePredictedImagePaperLocally } from "./buildImagePrediction";
import { generatePredictedPaperLocally } from "./buildPrediction";
import { subjectUsesPastPaperPredictions } from "./constants";
import type { GeneratePredictionRequest, PredictedPaperBlueprint, PredictionContentType } from "./types";

export function resolvePredictionContentType(subject: string): PredictionContentType {
  return subjectUsesPastPaperPredictions(subject) ? "pastpaper" : "image";
}

/**
 * Generates a prediction locally — past papers from Firestore tags, image subjects from Storage topics.
 * No external API, zero cost.
 */
export async function generatePredictedPaper(
  request: GeneratePredictionRequest
): Promise<PredictedPaperBlueprint> {
  const contentType = request.contentType ?? resolvePredictionContentType(request.subject);

  if (contentType === "image") {
    return generatePredictedImagePaperLocally(request.subject, request.level, request.targetYear);
  }

  const paperNumber = request.paperNumber ?? 1;
  return generatePredictedPaperLocally(
    request.subject,
    request.level,
    paperNumber,
    request.targetYear
  );
}
