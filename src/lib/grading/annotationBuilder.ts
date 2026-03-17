import type { CanvasAnnotation, CaptureWorldBounds, PartSummary, Pass1Result, Pass2Result } from "./GradingTypes";

function fracToWorld(bounds: CaptureWorldBounds, x: number, y: number): { x: number; y: number } {
  return {
    x: bounds.x + x * bounds.width,
    y: bounds.y + y * bounds.height,
  };
}

type WorldRect = { left: number; top: number; right: number; bottom: number };

function partRegionToWorld(bounds: CaptureWorldBounds, part: Pass1Result["parts"][number]): WorldRect {
  const leftTop = fracToWorld(bounds, part.workingsRegion.x, part.workingsRegion.y);
  const rightBottom = fracToWorld(
    bounds,
    part.workingsRegion.x + part.workingsRegion.width,
    part.workingsRegion.y + part.workingsRegion.height,
  );
  return {
    left: Math.min(leftTop.x, rightBottom.x),
    top: Math.min(leftTop.y, rightBottom.y),
    right: Math.max(leftTop.x, rightBottom.x),
    bottom: Math.max(leftTop.y, rightBottom.y),
  };
}

function pointIntersectsRect(point: { x: number; y: number }, rect: WorldRect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function chooseMarkPlacement(anchor: { x: number; y: number }, region: WorldRect): { x: number; y: number } {
  const candidates = [
    { x: region.right + 24, y: anchor.y },
    { x: region.left - 60, y: anchor.y },
    { x: anchor.x, y: region.bottom + 24 },
    { x: anchor.x, y: region.top - 40 },
  ];

  for (const candidate of candidates) {
    if (!pointIntersectsRect(candidate, region)) return candidate;
  }
  return candidates[candidates.length - 1];
}

function clampFraction(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function buildAnnotations(pass1: Pass1Result, pass2: Pass2Result, captureBounds: CaptureWorldBounds): CanvasAnnotation[] {
  const annotations: CanvasAnnotation[] = [];

  const partMap = new Map(pass1.parts.map((part) => [part.partId.toLowerCase(), part] as const));

  for (const part of pass2.parts) {
    const linkedPart = partMap.get(part.partId.toLowerCase());
    const region = linkedPart?.workingsRegion ?? { x: 0, y: 0, width: 1, height: 1 };
    const leftTop = fracToWorld(captureBounds, region.x, region.y);
    const rightBottom = fracToWorld(captureBounds, region.x + region.width, region.y + region.height);
    for (const error of part.errors) {
      const boxLeft = clampFraction(error.errorBox.x);
      const boxTop = clampFraction(error.errorBox.y);
      const boxWidth = clampFraction(error.errorBox.width);
      const boxHeight = clampFraction(error.errorBox.height);
      const worldX = captureBounds.x + boxLeft * captureBounds.width;
      const worldY = captureBounds.y + boxTop * captureBounds.height;
      const worldWidth = boxWidth * captureBounds.width;
      const worldHeight = boxHeight * captureBounds.height;

      const hasRenderableErrorBox = worldWidth >= 1 && worldHeight >= 1;
      let badgeWorldX = Math.max(leftTop.x, rightBottom.x) + 12;
      let badgeWorldY = (Math.min(leftTop.y, rightBottom.y) + Math.max(leftTop.y, rightBottom.y)) / 2;
      let errorBoxWorld: WorldRect | null = null;

      if (hasRenderableErrorBox) {
        const rightSideX = worldX + worldWidth + 12;
        const preferredRightWithinCapture = rightSideX <= captureBounds.x + captureBounds.width - 14;
        badgeWorldX = preferredRightWithinCapture ? rightSideX : worldX - 12 - 28;
        badgeWorldY = worldY + worldHeight / 2;
        errorBoxWorld = {
          left: worldX,
          top: worldY,
          right: worldX + worldWidth,
          bottom: worldY + worldHeight,
        };
        annotations.push({
          type: "errorBox",
          id: `${part.partId}-${error.id}`,
          worldX,
          worldY,
          worldWidth,
          worldHeight,
        });
      }

      annotations.push({
        type: "errorComment",
        id: `${part.partId}-${error.id}`,
        partId: part.partId,
        worldX: badgeWorldX,
        worldY: badgeWorldY,
        text: error.feedbackText,
        workingsRegionWorld: {
          left: Math.min(leftTop.x, rightBottom.x),
          top: Math.min(leftTop.y, rightBottom.y),
          right: Math.max(leftTop.x, rightBottom.x),
          bottom: Math.max(leftTop.y, rightBottom.y),
        },
        errorBoxWorld,
      });
    }
  }

  const markLabel = /^\d+\/\d+$/.test(pass2.markLabel)
    ? pass2.markLabel
    : `${Math.max(0, Math.round(pass2.totalAwarded))}/${Math.max(0, Math.round(pass2.totalAvailable))}`;

  const markAnchorWorld = fracToWorld(captureBounds, pass2.answerMarkPosition.x, pass2.answerMarkPosition.y);
  const answerPart = [...pass2.parts].reverse().find((part) => part.marksAvailable > 0) ?? pass2.parts[pass2.parts.length - 1];
  const answerPartP1 = answerPart
    ? pass1.parts.find((part) => part.partId.toLowerCase() === answerPart.partId.toLowerCase())
    : pass1.parts[pass1.parts.length - 1];
  const regionWorld = answerPartP1 ? partRegionToWorld(captureBounds, answerPartP1) : {
    left: captureBounds.x,
    top: captureBounds.y,
    right: captureBounds.x + captureBounds.width,
    bottom: captureBounds.y + captureBounds.height,
  };
  const markWorld = chooseMarkPlacement(markAnchorWorld, regionWorld);

  annotations.push({
    type: "markAnnotation",
    worldX: markWorld.x,
    worldY: markWorld.y,
    label: markLabel,
  });

  return annotations;
}

export function buildPartSummary(pass2: Pass2Result): PartSummary[] {
  return pass2.parts.map((part) => {
    let summary = "correct";
    if (part.errors.length === 1) {
      summary = part.errors[0].feedbackText;
    } else if (part.errors.length === 2) {
      const first = part.errors[0].feedbackText;
      const second = part.errors[1].feedbackText.replace(/^You\s+/, "you ");
      summary = `${first}, and ${second.charAt(0).toLowerCase() + second.slice(1)}`;
    } else if (part.errors.length > 2) {
      const first = part.errors[0].feedbackText;
      const count = part.errors.length - 1;
      summary = `${first}, plus ${count} more \u2014 see the annotations on your working`;
    }
    return {
      partId: part.partId,
      marksAwarded: part.marksAwarded,
      marksAvailable: part.marksAvailable,
      summary,
    };
  });
}
