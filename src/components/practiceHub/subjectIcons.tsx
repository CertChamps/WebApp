import type { IconType } from "react-icons";
import {
  PiAtom as LuAtom,
  PiBookOpen as LuBookOpen,
  PiBriefcase as LuBriefcase,
  PiBracketsCurly as LuBraces,
  PiCalculator as LuCalculator,
  PiChefHat as LuChefHat,
  PiCode as LuCode,
  PiCpu as LuCpu,
  PiDna as LuDna,
  PiBarbell as LuDumbbell,
  PiFlask as LuFlaskConical,
  PiGlobe as LuGlobe,
  PiHammer as LuHammer,
  PiHeart as LuHeart,
  PiBank as LuLandmark,
  PiTranslate as LuLanguages,
  PiLink as LuLink,
  PiMusicNotes as LuMusic,
  PiPalette as LuPalette,
  PiRuler as LuRuler,
  PiScales as LuScale,
  PiScroll as LuScroll,
  PiPlant as LuSprout,
  PiTrendUp as LuTrendingUp,
  PiWrench as LuWrench,
} from "react-icons/pi";
import IrishHarpIcon from "./IrishHarpIcon";

const SUBJECT_ICONS: Record<string, IconType> = {
  accounting: LuCalculator,
  "agricultural-science": LuSprout,
  "ancient-greek": LuLandmark,
  "applied-mathematics": LuBraces,
  art: LuPalette,
  biology: LuDna,
  business: LuBriefcase,
  chemistry: LuFlaskConical,
  "classical-studies": LuScroll,
  "computer-science": LuCode,
  "construction-studies": LuHammer,
  "design-communication-graphics": LuRuler,
  economics: LuTrendingUp,
  engineering: LuWrench,
  english: LuBookOpen,
  geography: LuGlobe,
  "history-early-modern": LuLandmark,
  "history-later-modern": LuLandmark,
  "home-economics": LuChefHat,
  "link-modules": LuLink,
  mathematics: LuCalculator,
  music: LuMusic,
  "physical-education": LuDumbbell,
  physics: LuAtom,
  "physics-and-chemistry": LuFlaskConical,
  "politics-and-society": LuScale,
  "religious-education": LuHeart,
  technology: LuCpu,
};

export function getSubjectIcon(subjectId: string): IconType {
  return SUBJECT_ICONS[subjectId] ?? LuLanguages;
}

/** Themed glyph for a subject (Irish uses the harp mark). */
export function SubjectGlyph({
  subjectId,
  size = 22,
  className = "color-txt-accent",
}: {
  subjectId: string;
  size?: number;
  className?: string;
}) {
  if (subjectId === "irish") {
    return <IrishHarpIcon size={size} className={className} />;
  }
  const Icon = getSubjectIcon(subjectId);
  return <Icon size={size} className={className} aria-hidden />;
}
