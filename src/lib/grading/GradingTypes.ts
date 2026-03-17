import type { z } from "zod";
import { Pass1Schema, Pass2Schema } from "./GradingSchemas";

export type Pass1Result = z.infer<typeof Pass1Schema>;
export type Pass2Result = z.infer<typeof Pass2Schema>;

export type GradingStatus =
  | "idle"
  | "capturing"
  | "reading"
  | "marking"
  | "rendering"
  | "done"
  | "error";

export type CaptureWorldBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasCapturePayload = {
  dataUrl: string;
  imageWidth: number;
  imageHeight: number;
  captureWorldBounds: CaptureWorldBounds;
};

export type PartWorldRegion = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ErrorCommentAnnotation = {
  type: "errorComment";
  id: string;
  partId: string;
  worldX: number;
  worldY: number;
  text: string;
  workingsRegionWorld: PartWorldRegion;
  errorBoxWorld: PartWorldRegion | null;
};

export type ErrorBoxAnnotation = {
  type: "errorBox";
  id: string;
  worldX: number;
  worldY: number;
  worldWidth: number;
  worldHeight: number;
};

export type MarkAnnotation = {
  type: "markAnnotation";
  worldX: number;
  worldY: number;
  label: string;
};

export type HandCircleAnnotation = {
  type: "handCircle";
  worldX: number;
  worldY: number;
  width: number;
  height: number;
};

export type CanvasAnnotation = ErrorCommentAnnotation | ErrorBoxAnnotation | MarkAnnotation | HandCircleAnnotation;

export type GradingResult = {
  pass1: Pass1Result;
  pass2: Pass2Result;
  annotations: CanvasAnnotation[];
};

export type PartSummary = {
  partId: string;
  marksAwarded: number;
  marksAvailable: number;
  summary: string;
};
