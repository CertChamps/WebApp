import TutorialHoleScrim from "./TutorialHoleScrim";
import type { TutorialAnchorRect } from "./types";

export type { TutorialAnchorRect as CardTutorialAnchorRect };

type Props = {
  anchorRect: TutorialAnchorRect;
};

export default function PredictionCardTutorialScrim({ anchorRect }: Props) {
  return <TutorialHoleScrim anchorRect={anchorRect} />;
}
