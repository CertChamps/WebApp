import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { storage } from "../../firebase";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import Fuse from "fuse.js";
import {
  useExamPapers,
  normalizePaperLevel,
  formatLevelDisplay,
  getExamPaperKey,
  type ExamPaper,
  type PaperQuestion,
} from "../hooks/useExamPapers";
import { usePredictionPapers } from "../hooks/usePredictionPapers";
import {
  buildFreeImageSample,
  canAccessImageTopic,
  canAccessPaper,
  computeFreePaperKeys,
  getContentAccessLabel,
  hasAceAccess,
  isImageTopicContentFree,
  pickStarterImageTopic,
  type ContentAccessLabel,
} from "../lib/contentAccess";
import { UserContext } from "../context/UserContext";
import ContentProGate from "../components/ContentProGate";
import { usePaperSnapshot, usePaperPageCount } from "../hooks/usePaperSnapshot";
import { useImageTopics, listQuestionsForTopic, groupImageQuestions, type ImageTopic } from "../hooks/useImageQuestions";
import { motion, AnimatePresence } from "framer-motion";
import { LuX, LuChevronRight, LuSearch, LuFileCheck, LuChevronUp, LuChevronDown, LuTrash2, LuImage, LuStar, LuSparkles, LuCalculator, LuSprout, LuLandmark, LuBraces, LuLanguages, LuPalette, LuDna, LuBriefcase, LuFlaskConical, LuScroll, LuCode, LuHammer, LuRuler, LuTrendingUp, LuWrench, LuBookOpen, LuGlobe, LuChefHat, LuMusic, LuDumbbell, LuAtom, LuScale, LuCpu, LuLink, LuHeart, LuArrowLeft, LuLock } from "react-icons/lu";
import type { IconType } from "react-icons";
import { subjectMatchesPaper, getStorageFolderName, getFavouriteSubjectIds, FAVOURITES_CHANGED_EVENT, PRACTICE_HUB_SUBJECTS, getSubjectLabel } from "../data/practiceHubSubjects";
import { SubjectDropdown, YearClockPicker, type YearFilterValue } from "../components/practiceHub";
import IrishHarpIcon from "../components/practiceHub/IrishHarpIcon";
import GeneratePredictionFlow, {
  PREDICTION_SELECT_CLASS,
  type GeneratePredictionFlowHandle,
} from "../components/addQuestions/GeneratePredictionFlow";
import PredictionTutorialCallout from "../components/tutorial/PredictionTutorialCallout";
import PredictionCardTutorialCallout from "../components/tutorial/PredictionCardTutorialCallout";
import PredictionCardTutorialScrim from "../components/tutorial/PredictionCardTutorialScrim";
import {
  consumePendingPredictionTutorial,
  shouldStartPredictionTutorial,
  stripPredictionTutorialQuery,
  type PredictionTutorialStep,
} from "../lib/predictionTutorial";
import {
  consumePendingPracticeSessionTutorial,
  markPendingPracticeSessionTutorial,
} from "../lib/practiceSessionTutorial";
import { resolvePredictionContentType } from "../lib/predictions/api";
import {
  loadStoredImagePredictionQuestions,
  type StoredImagePredictionQuestion,
} from "../lib/predictions/loadPredictionImages";
import { deletePredictedPaper } from "../lib/predictions/deletePredictedPaper";
import CroppedPdfRegions from "../components/questions/CroppedPdfRegions";
import { getThemedPortalTarget } from "../utils/themedPortal";
import "../styles/decks.css";
import "../styles/practiceHub.css";

/** One searchable row for global question search (paper or image question). */
type GlobalSearchEntry = {
  paper: ExamPaper | null;
  question: PaperQuestion | null;
  indexInPaper: number;
  paperLabel: string;
  questionName: string;
  tagsStr: string;
  imageMode?: boolean;
  imageSubject?: string;
  imageLevel?: string;
  imageTopic?: string;
  imageKey?: string;
};

/** Derive paper number (1 or 2) from label or id; null if unclear. */
function getPaperNumber(paper: ExamPaper): number | null {
  const s = `${paper.label ?? ""} ${paper.id ?? ""}`.toLowerCase();
  if (/\bpaper\s*1\b|paper-1/.test(s)) return 1;
  if (/\bpaper\s*2\b|paper-2/.test(s)) return 2;
  return null;
}

type PaperFilter = "1" | "2" | "all";
type LevelFilter = "higher" | "ordinary" | "foundation" | "all";

const LEVEL_OPTIONS: { value: LevelFilter; code: string; display: string }[] = [
  { value: "higher", code: "HL", display: "higher" },
  { value: "ordinary", code: "OL", display: "ordinary" },
  { value: "foundation", code: "FD", display: "foundation" },
  { value: "all", code: "all", display: "level" },
];

const LEVEL_ORDER: LevelFilter[] = ["all", "higher", "ordinary", "foundation"];
const LEVEL_DRAG_THRESHOLD_PX = 8;
const LEVEL_DRAG_STEP_PX = 20;

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

function getSubjectIcon(subjectId: string): IconType {
  return SUBJECT_ICONS[subjectId] ?? LuLanguages;
}

export default function PracticeHub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useContext(UserContext);
  const userUid = user?.uid ?? null;
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [papersReloadKey, setPapersReloadKey] = useState(0);
  const {
    papers,
    loading: papersLoading,
    getPaperBlob,
    getPaperBlobForQuestion,
    getPaperQuestions,
    firstFreePaper,
  } = useExamPapers(subjectFilter, {
    loadAllWhenNull: subjectFilter == null,
    reloadKey: papersReloadKey,
    uid: userUid,
  });
  const {
    predictions: predictionPapers,
    loading: predictionsLoading,
  } = usePredictionPapers(userUid, subjectFilter, { reloadKey: papersReloadKey });
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<PredictionTutorialStep | null>(null);
  const [tutorialHighlightPaperId, setTutorialHighlightPaperId] = useState<string | null>(null);
  const tutorialCardAnchorRef = useRef<HTMLDivElement>(null);
  const [cardSpotlightRect, setCardSpotlightRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const isModalTutorialStep = tutorialStep === 1 || tutorialStep === 2;
  const isCardTutorialStep = tutorialStep === 3 && tutorialHighlightPaperId !== null;
  const tutorialHighlightPaper = useMemo(() => {
    if (!isCardTutorialStep || predictionsLoading) return null;
    if (tutorialHighlightPaperId) {
      const matched = predictionPapers.find((paper) => paper.id === tutorialHighlightPaperId);
      if (matched) return matched;
    }
    return predictionPapers[0] ?? null;
  }, [
    isCardTutorialStep,
    predictionsLoading,
    predictionPapers,
    tutorialHighlightPaperId,
  ]);
  const highlightPaperReady = isCardTutorialStep && tutorialHighlightPaper !== null;
  const cardTutorialUiReady = highlightPaperReady && cardSpotlightRect !== null;
  const [predictionSubject, setPredictionSubject] = useState(
    () => PRACTICE_HUB_SUBJECTS[0]?.id ?? "accounting"
  );
  const [predictionLevel, setPredictionLevel] = useState("higher");
  const [predictionPaper, setPredictionPaper] = useState<1 | 2>(1);
  const predictionFlowRef = useRef<GeneratePredictionFlowHandle>(null);
  const [predictionGenerating, setPredictionGenerating] = useState(false);
  const predictionUsesPastPapers = useMemo(
    () => resolvePredictionContentType(predictionSubject) === "pastpaper",
    [predictionSubject]
  );
  const [showContentGateModal, setShowContentGateModal] = useState(false);
  const [paperFilter, setPaperFilter] = useState<PaperFilter>("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const openPredictionModal = useCallback(() => {
    if (subjectFilter && PRACTICE_HUB_SUBJECTS.some((s) => s.id === subjectFilter)) {
      setPredictionSubject(subjectFilter);
    } else {
      setPredictionSubject((prev) =>
        PRACTICE_HUB_SUBJECTS.some((s) => s.id === prev)
          ? prev
          : (PRACTICE_HUB_SUBJECTS[0]?.id ?? "accounting")
      );
    }
    if (levelFilter === "higher" || levelFilter === "ordinary") {
      setPredictionLevel(levelFilter);
    }
    setShowPredictionModal(true);
  }, [subjectFilter, levelFilter]);

  const closePredictionModal = useCallback(() => {
    setShowPredictionModal(false);
    setTutorialStep((current) => (current === 1 || current === 2 ? null : current));
  }, []);

  const finishCardTutorial = useCallback(() => {
    setTutorialStep(null);
    setTutorialHighlightPaperId(null);
    setCardSpotlightRect(null);
  }, []);

  const startPredictionTutorial = useCallback(() => {
    setShowPredictionModal(true);
    setTutorialStep(1);
  }, []);

  const tutorialStartedRef = useRef(false);
  const tutorialStepRef = useRef<PredictionTutorialStep | null>(tutorialStep);
  tutorialStepRef.current = tutorialStep;

  useEffect(() => {
    if (tutorialStartedRef.current) return;

    const pending = consumePendingPredictionTutorial();
    const fromQuery = shouldStartPredictionTutorial(`?${searchParams.toString()}`);

    if (!pending && !fromQuery) return;

    tutorialStartedRef.current = true;
    startPredictionTutorial();

    if (fromQuery) {
      const nextSearch = stripPredictionTutorialQuery(`?${searchParams.toString()}`);
      navigate(
        {
          pathname: "/practice",
          search: nextSearch,
        },
        { replace: true }
      );
    }
  }, [navigate, searchParams, startPredictionTutorial]);
  const [yearFilter, setYearFilter] = useState<YearFilterValue>("all");
  const [topicFilter, setTopicFilter] = useState<string[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [panelAnimationDone, setPanelAnimationDone] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<PaperQuestion[]>([]);
  const [selectedPrediction, setSelectedPrediction] = useState<ExamPaper | null>(null);
  const [predictionPanelAnimationDone, setPredictionPanelAnimationDone] = useState(false);
  const [predictionQuestions, setPredictionQuestions] = useState<PaperQuestion[]>([]);
  const [predictionImageQuestions, setPredictionImageQuestions] = useState<
    StoredImagePredictionQuestion[]
  >([]);
  const [predictionQuestionsLoading, setPredictionQuestionsLoading] = useState(false);
  const [predictionDeleteConfirm, setPredictionDeleteConfirm] = useState(false);
  const [predictionDeleting, setPredictionDeleting] = useState(false);
  const [paperTagsMap, setPaperTagsMap] = useState<Record<string, string[]>>({});
  const [paperQuestionCountMap, setPaperQuestionCountMap] = useState<Record<string, number>>({});

  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchIndex, setGlobalSearchIndex] = useState<Fuse<GlobalSearchEntry> | null>(null);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const globalSearchContainerRef = useRef<HTMLDivElement>(null);

  const [hubFavourites, setHubFavourites] = useState<string[]>(() => getFavouriteSubjectIds());
  const onFavouritesChange = useCallback((ids: string[]) => setHubFavourites(ids), []);
  useEffect(() => {
    const syncFavourites = () => setHubFavourites(getFavouriteSubjectIds());
    window.addEventListener(FAVOURITES_CHANGED_EVENT, syncFavourites);
    return () => window.removeEventListener(FAVOURITES_CHANGED_EVENT, syncFavourites);
  }, []);

  const handleSubjectSelect = useCallback((subjectId: string) => {
    setSubjectFilter(subjectId);
  }, []);

  const favouriteSubjects = useMemo(
    () => PRACTICE_HUB_SUBJECTS.filter((s) => hubFavourites.includes(s.id)),
    [hubFavourites]
  );

  const [topicsOpen, setTopicsOpen] = useState(false);
  const [, setPendingTopicFilter] = useState<string[]>([]);
  const [, setPendingSubTopicFilter] = useState<string[]>([]);
  const topicsContainerRef = useRef<HTMLDivElement>(null);

  const storageFolderName = useMemo(
    () => (subjectFilter ? getStorageFolderName(subjectFilter) : null),
    [subjectFilter]
  );

  const isImageMode = subjectFilter != null && !papersLoading && papers.length === 0;

  const imageLevelFilter = levelFilter === "all" ? null : levelFilter;
  const {
    topics: imageTopics,
    levels: imageLevels,
    loading: imageTopicsLoading,
    error: imageTopicsError,
  } = useImageTopics(isImageMode ? storageFolderName : null, imageLevelFilter);

  /** Image topics are level-scoped; pick a concrete level when filter is "all" or invalid. */
  useEffect(() => {
    if (!isImageMode || imageLevels.length === 0) return;
    setLevelFilter((current) => {
      if (current !== "all" && imageLevels.includes(current)) return current;
      return (imageLevels.includes("higher") ? "higher" : imageLevels[0]) as LevelFilter;
    });
  }, [isImageMode, imageLevels]);

  const activeImageLevel = imageLevelFilter ?? imageLevels[0] ?? "higher";

  const [selectedImageTopic, setSelectedImageTopic] = useState<ImageTopic | null>(null);

  useEffect(() => {
    setSelectedImageTopic(null);
    setGlobalSearchIndex(null);
  }, [subjectFilter, levelFilter]);

  const resetAllFilters = useCallback(() => {
    setSubjectFilter(null);
    setPaperFilter("all");
    setLevelFilter("all");
    setYearFilter("all");
    setTopicFilter([]);
    setPendingTopicFilter([]);
    setPendingSubTopicFilter([]);
    setTopicsOpen(false);
    setSelectedImageTopic(null);
  }, []);

  const openSubjectPicker = useCallback(() => {
    const trigger = document.getElementById("ph-subject") as HTMLButtonElement | null;
    if (!trigger) return;

    trigger.focus();

    const isExpanded = trigger.getAttribute("aria-expanded") === "true";
    if (!isExpanded) {
      trigger.click();
    }

    // Search input mounts after opening; focus it on the next frame.
    requestAnimationFrame(() => {
      const searchInput = document.querySelector<HTMLInputElement>(".practice-hub__subject-search");
      searchInput?.focus();
      searchInput?.select();
    });
  }, []);
  const [levelOpen, setLevelOpen] = useState(false);
  const [levelTriggerDragging, setLevelTriggerDragging] = useState(false);
  const levelContainerRef = useRef<HTMLDivElement>(null);
  const levelTriggerRef = useRef<HTMLButtonElement>(null);
  const levelFilterRef = useRef(levelFilter);
  const levelTriggerDragRef = useRef<{
    startY: number;
    isDrag: boolean;
    lastY: number;
    accum: number;
  } | null>(null);

  const [panelTagsExpanded, setPanelTagsExpanded] = useState(false);
  const [tagsVisibleWhenCollapsed, setTagsVisibleWhenCollapsed] = useState(1);
  const panelTagsContainerRef = useRef<HTMLDivElement>(null);
  const panelTagsMeasureRef = useRef<HTMLDivElement>(null);

  const selectedPaperKey = useMemo(
    () => (selectedPaper ? getExamPaperKey(selectedPaper) : null),
    [selectedPaper]
  );

  levelFilterRef.current = levelFilter;

  useEffect(() => {
    setPanelTagsExpanded(false);
    setTagsVisibleWhenCollapsed(1);
  }, [selectedPaperKey]);

  const filteredByMeta = useMemo(() => {
    return papers.filter((p) => {
      if (!subjectMatchesPaper(subjectFilter, p.subject)) return false;
      const num = getPaperNumber(p);
      if (paperFilter !== "all") {
        const want = paperFilter === "1" ? 1 : 2;
        if (num !== want) return false;
      }
      if (levelFilter !== "all" && normalizePaperLevel(p.level) !== normalizePaperLevel(levelFilter)) return false;
      if (yearFilter !== "all" && p.year !== yearFilter) return false;
      return true;
    });
  }, [papers, subjectFilter, paperFilter, levelFilter, yearFilter]);

  const normTag = useCallback((t: string) => t.trim().toLowerCase().replace(/\s*&\s*/g, " and "), []);
  const filteredPapers = useMemo(() => {
    if (topicFilter.length === 0) return filteredByMeta;
    const set = new Set(topicFilter.map(normTag));
    return filteredByMeta.filter((p) => {
      const tags = paperTagsMap[getExamPaperKey(p)] ?? [];
      return tags.some((tag) => set.has(normTag(String(tag))));
    });
  }, [filteredByMeta, topicFilter, paperTagsMap, normTag]);

  const freePaperKeys = useMemo(() => computeFreePaperKeys(papers), [papers]);

  const starterImageTopic = useMemo(
    () => pickStarterImageTopic(imageTopics, storageFolderName),
    [imageTopics, storageFolderName]
  );

  const freeImageSample = useMemo(
    () =>
      buildFreeImageSample(
        starterImageTopic,
        storageFolderName,
        activeImageLevel
      ),
    [starterImageTopic, storageFolderName, activeImageLevel]
  );

  const topicEntries = useMemo(() => {
    const map = new Map<string, { label: string; paperCount: number }>();
    filteredByMeta.forEach((paper) => {
      const tags = paperTagsMap[getExamPaperKey(paper)] ?? [];
      const seen = new Set<string>();
      tags.forEach((tag) => {
        const raw = String(tag).trim();
        if (!raw) return;
        const normalized = normTag(raw);
        if (seen.has(normalized)) return;
        seen.add(normalized);
        const existing = map.get(normalized);
        if (existing) {
          existing.paperCount += 1;
        } else {
          map.set(normalized, { label: raw, paperCount: 1 });
        }
      });
    });
    return Array.from(map.entries())
      .map(([normalized, data]) => ({ normalized, ...data }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredByMeta, paperTagsMap, normTag]);

  const imageTopicEntries = useMemo(() => {
    return imageTopics
      .map((topic) => ({
        normalized: normTag(topic.displayName),
        label: topic.displayName,
        questionCount: topic.questionCount,
        topic,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [imageTopics, normTag]);

  useEffect(() => {
    if (filteredByMeta.length === 0) {
      setPaperTagsMap({});
      setPaperQuestionCountMap({});
      return;
    }
    let cancelled = false;
    const nextTags: Record<string, string[]> = {};
    const nextCounts: Record<string, number> = {};
    const done = () => {
      if (!cancelled) {
        setPaperTagsMap(nextTags);
        setPaperQuestionCountMap(nextCounts);
      }
    };
    let pending = filteredByMeta.length;
    filteredByMeta.forEach((paper) => {
      getPaperQuestions(paper).then((questions) => {
        if (cancelled) return;
        const paperKey = getExamPaperKey(paper);
        const tags = new Set<string>();
        questions.forEach((q) => q.tags?.forEach((t) => tags.add(String(t))));
        nextTags[paperKey] = Array.from(tags);
        nextCounts[paperKey] = questions.length;
        pending--;
        if (pending === 0) done();
      }).catch(() => {
        if (cancelled) return;
        const paperKey = getExamPaperKey(paper);
        nextTags[paperKey] = [];
        nextCounts[paperKey] = 0;
        pending--;
        if (pending === 0) done();
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filteredByMeta, getPaperQuestions]);

  /* Defer PDF/questions load until after panel open animation so slide-in stays smooth */
  useEffect(() => {
    if (!selectedPaper) {
      setPanelAnimationDone(false);
      setPreviewBlob(null);
      setPreviewQuestions([]);
      return;
    }
    if (!panelAnimationDone) return;
    let cancelled = false;
    setPreviewBlob(null);
    setPreviewQuestions([]);
    Promise.all([getPaperBlob(selectedPaper), getPaperQuestions(selectedPaper)]).then(
      ([blob, questions]) => {
        if (!cancelled) {
          setPreviewBlob(blob);
          setPreviewQuestions(questions);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [selectedPaper, panelAnimationDone, getPaperBlob, getPaperQuestions]);

  /* Defer prediction question load until after panel slide-in completes. */
  useEffect(() => {
    if (!selectedPrediction) {
      setPredictionPanelAnimationDone(false);
      setPredictionQuestions([]);
      setPredictionImageQuestions([]);
      setPredictionQuestionsLoading(false);
      setPredictionDeleteConfirm(false);
      setPredictionDeleting(false);
      return;
    }
    if (!predictionPanelAnimationDone) return;
    let cancelled = false;
    setPredictionQuestionsLoading(true);
    setPredictionQuestions([]);
    setPredictionImageQuestions([]);
    const isImage = selectedPrediction.contentType === "image";
    const loader = isImage
      ? userUid
        ? loadStoredImagePredictionQuestions(userUid, selectedPrediction.id).then((qs) => {
            if (!cancelled) setPredictionImageQuestions(qs);
          })
        : Promise.resolve()
      : getPaperQuestions(selectedPrediction).then((qs) => {
          if (!cancelled) setPredictionQuestions(qs);
        });
    loader
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load prediction questions:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setPredictionQuestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPrediction, predictionPanelAnimationDone, getPaperQuestions, userUid]);

  const allTagsInPreview = useMemo(() => {
    const set = new Set<string>();
    previewQuestions.forEach((q) => q.tags?.forEach((t) => set.add(String(t))));
    return Array.from(set).sort();
  }, [previewQuestions]);

  useLayoutEffect(() => {
    if (panelTagsExpanded || allTagsInPreview.length === 0) return;
    const container = panelTagsContainerRef.current;
    const measure = panelTagsMeasureRef.current;
    if (!container || !measure) return;
    const gap = 8;
    const maxWidth = container.clientWidth;
    let sum = 0;
    let count = 0;
    for (const child of measure.children) {
      const w = (child as HTMLElement).offsetWidth;
      if (count > 0) sum += gap;
      sum += w;
      if (sum > maxWidth) break;
      count += 1;
    }
    setTagsVisibleWhenCollapsed(count > 0 ? count : 1);
  }, [panelTagsExpanded, allTagsInPreview, selectedPaper?.id]);

  const goToPaperSession = useCallback(
    (paper: ExamPaper) => {
      if (!canAccessPaper(user, paper, freePaperKeys)) {
        setShowContentGateModal(true);
        return;
      }
      const normalizedLevel = normalizePaperLevel(paper.level);
      if (paper.contentType === "image") {
        navigate(
          `/practice/session?mode=imagequestions&predictionId=${encodeURIComponent(paper.id)}&level=${normalizedLevel}&subject=${encodeURIComponent(paper.subject ?? "")}`
        );
      } else {
        navigate(
          `/practice/session?mode=pastpaper&paperId=${paper.id}&level=${normalizedLevel}&subject=${paper.subject ?? ""}`
        );
      }
    },
    [user, freePaperKeys, navigate]
  );

  const handleDeletePrediction = useCallback(async () => {
    if (!selectedPrediction || !userUid) return;
    setPredictionDeleting(true);
    try {
      await deletePredictedPaper(userUid, selectedPrediction.id);
      setSelectedPrediction(null);
      setPapersReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to delete prediction:", err);
    } finally {
      setPredictionDeleting(false);
      setPredictionDeleteConfirm(false);
    }
  }, [selectedPrediction, userUid]);

  const handlePredictionSelect = useCallback(
    (paper: ExamPaper) => {
      if (
        isCardTutorialStep &&
        tutorialHighlightPaper &&
        paper.id === tutorialHighlightPaper.id
      ) {
        markPendingPracticeSessionTutorial();
        finishCardTutorial();
        goToPaperSession(paper);
        return;
      }
      setSelectedPrediction(paper);
      setPredictionPanelAnimationDone(false);
    },
    [isCardTutorialStep, tutorialHighlightPaper, finishCardTutorial, goToPaperSession]
  );

  const updateCardSpotlightRect = useCallback(() => {
    const el = tutorialCardAnchorRef.current;
    if (!el) return;
    const deck = el.querySelector<HTMLElement>(".deck");
    const target = deck ?? el;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setCardSpotlightRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const assignTutorialCardAnchorRef = useCallback(
    (node: HTMLDivElement | null) => {
      tutorialCardAnchorRef.current = node;
      if (!node || !highlightPaperReady) return;
      const deck = node.querySelector<HTMLElement>(".deck");
      const target = deck ?? node;
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCardSpotlightRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    },
    [highlightPaperReady]
  );

  useEffect(() => {
    if (!highlightPaperReady) return;
    tutorialCardAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(updateCardSpotlightRect, 350);
    return () => window.clearTimeout(timer);
  }, [highlightPaperReady, tutorialHighlightPaper?.id, updateCardSpotlightRect]);

  useLayoutEffect(() => {
    if (!highlightPaperReady) {
      setCardSpotlightRect(null);
      return;
    }

    updateCardSpotlightRect();
    window.addEventListener("resize", updateCardSpotlightRect);
    window.addEventListener("scroll", updateCardSpotlightRect, true);
    return () => {
      window.removeEventListener("resize", updateCardSpotlightRect);
      window.removeEventListener("scroll", updateCardSpotlightRect, true);
    };
  }, [highlightPaperReady, tutorialHighlightPaper?.id, updateCardSpotlightRect]);

  /** Past-paper predictions often have no composite PDF; use first source paper for card preview. */
  const getPredictionPaperPreviewBlob = useCallback(
    async (paper: ExamPaper): Promise<Blob> => {
      if (paper.storagePath?.trim()) {
        return getPaperBlob(paper);
      }
      const questions = await getPaperQuestions(paper);
      const path = questions.find((q) => q.sourceStoragePath?.trim())?.sourceStoragePath?.trim();
      if (!path) {
        throw new Error("No PDF path for prediction preview");
      }
      return getPaperBlob({ ...paper, storagePath: path });
    },
    [getPaperBlob, getPaperQuestions]
  );

  const goToSession = useCallback(() => {
    if (!selectedPaper) return;
    goToPaperSession(selectedPaper);
  }, [selectedPaper, goToPaperSession]);

  const goToImageSession = useCallback(() => {
    if (!selectedImageTopic || !storageFolderName) return;
    if (!canAccessImageTopic(user, selectedImageTopic, starterImageTopic, storageFolderName)) {
      setShowContentGateModal(true);
      return;
    }
    const level = activeImageLevel;
    navigate(
      `/practice/session?mode=imagequestions&subject=${encodeURIComponent(storageFolderName)}&level=${encodeURIComponent(level)}&topic=${encodeURIComponent(selectedImageTopic.name)}`
    );
  }, [selectedImageTopic, storageFolderName, activeImageLevel, navigate, user, starterImageTopic]);

  const goToImageTopicSession = useCallback(
    (topic: ImageTopic) => {
      if (!storageFolderName) return;
      if (!canAccessImageTopic(user, topic, starterImageTopic, storageFolderName)) {
        setShowContentGateModal(true);
        return;
      }
      const level = activeImageLevel;
      navigate(
        `/practice/session?mode=imagequestions&subject=${encodeURIComponent(storageFolderName)}&level=${encodeURIComponent(level)}&topic=${encodeURIComponent(topic.name)}`
      );
    },
    [storageFolderName, activeImageLevel, navigate, user, starterImageTopic]
  );

  const goToPastPaperTopicSession = useCallback(
    (topic: string) => {
      const topicKey = normTag(topic);
      const matchingPapers = filteredByMeta.filter((paper) => {
        const tags = paperTagsMap[getExamPaperKey(paper)] ?? [];
        return tags.some((tag) => normTag(String(tag)) === topicKey);
      });
      if (matchingPapers.length === 0) return;

      let targetPaper = matchingPapers[0];
      if (!hasAceAccess(user)) {
        const freePaper = matchingPapers.find((paper) => canAccessPaper(user, paper, freePaperKeys));
        if (!freePaper) {
          setShowContentGateModal(true);
          return;
        }
        targetPaper = freePaper;
      }

      const normalizedLevel = normalizePaperLevel(targetPaper.level);
      navigate(
        `/practice/session?mode=pastpaper&paperId=${targetPaper.id}&level=${encodeURIComponent(normalizedLevel)}&subject=${encodeURIComponent(targetPaper.subject ?? "")}&topics=${encodeURIComponent(topic)}`
      );
    },
    [filteredByMeta, normTag, paperTagsMap, user, freePaperKeys, navigate]
  );

  // Build global search index when user opens search (lazy) – supports both paper and image modes
  useEffect(() => {
    if (!globalSearchOpen) return;
    const hasContent = papers.length > 0 || (isImageMode && imageTopics.length > 0);
    if (!hasContent) return;
    let cancelled = false;
    setGlobalSearchLoading(true);

    (async () => {
      try {
        const entries: GlobalSearchEntry[] = [];

        if (isImageMode && storageFolderName && imageTopics.length > 0) {
          const level = activeImageLevel;
          const topicArrays = await Promise.all(
            imageTopics.map(async (topic) => {
              try {
                const qs = await listQuestionsForTopic(storageFolderName, level, topic.name);
                const grouped = groupImageQuestions(qs);
                return grouped.map((g) => ({
                  paper: null,
                  question: null,
                  indexInPaper: 0,
                  paperLabel: `${topic.displayName} · ${formatLevelDisplay(level)}`,
                  questionName: g.displayName,
                  tagsStr: topic.displayName,
                  imageMode: true,
                  imageSubject: storageFolderName,
                  imageLevel: level,
                  imageTopic: topic.name,
                  imageKey: g.key,
                } satisfies GlobalSearchEntry));
              } catch {
                return [] as GlobalSearchEntry[];
              }
            })
          );
          entries.push(...topicArrays.flat());
        } else if (papers.length > 0) {
          const paperArrays = await Promise.all(
            papers.map(async (paper) => {
              const questions = await getPaperQuestions(paper);
              const label = paper.label ?? paper.id ?? "";
              return questions.map((q, indexInPaper) => ({
                paper,
                question: q,
                indexInPaper,
                paperLabel: label,
                questionName: q.questionName ?? q.id ?? "",
                tagsStr: Array.isArray(q.tags) ? q.tags.join(", ") : "",
              } satisfies GlobalSearchEntry));
            })
          );
          entries.push(...paperArrays.flat());
        }

        if (!cancelled) {
          setGlobalSearchIndex(
            new Fuse(entries, { keys: ["questionName", "tagsStr", "paperLabel"], isCaseSensitive: false })
          );
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setGlobalSearchLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [papers, getPaperQuestions, globalSearchOpen, isImageMode, imageTopics, storageFolderName, activeImageLevel, imageLevels]);

  const globalSearchResults = useMemo(() => {
    const q = globalSearchQuery.trim();
    if (!globalSearchIndex) return [];
    if (!q) return [];
    return globalSearchIndex.search(q).slice(0, 12).map((r) => r.item);
  }, [globalSearchIndex, globalSearchQuery]);

  const goToQuestion = useCallback(
    (entry: GlobalSearchEntry) => {
      if (entry.imageMode) {
        const topic = imageTopics.find((t) => t.name === entry.imageTopic);
        if (topic && !canAccessImageTopic(user, topic, starterImageTopic, storageFolderName)) {
          setShowContentGateModal(true);
          setGlobalSearchOpen(false);
          setGlobalSearchQuery("");
          return;
        }
        navigate(
          `/practice/session?mode=imagequestions&subject=${encodeURIComponent(entry.imageSubject ?? "")}&level=${encodeURIComponent(entry.imageLevel ?? "")}&topic=${encodeURIComponent(entry.imageTopic ?? "")}&imageKey=${encodeURIComponent(entry.imageKey ?? "")}`
        );
        setGlobalSearchOpen(false);
        setGlobalSearchQuery("");
        return;
      }
      if (entry.paper && !canAccessPaper(user, entry.paper, freePaperKeys)) {
        setShowContentGateModal(true);
        setGlobalSearchOpen(false);
        setGlobalSearchQuery("");
        return;
      }
      const normalizedLevel = normalizePaperLevel(entry.paper?.level);
      navigate(
        `/practice/session?mode=pastpaper&paperId=${entry.paper?.id}&level=${normalizedLevel}&subject=${entry.paper?.subject ?? ""}&indexInPaper=${entry.indexInPaper}`
      );
      setGlobalSearchOpen(false);
      setGlobalSearchQuery("");
    },
    [navigate, user, freePaperKeys, imageTopics, starterImageTopic, storageFolderName]
  );


  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        globalSearchContainerRef.current &&
        !globalSearchContainerRef.current.contains(target)
      ) {
        setGlobalSearchOpen(false);
      }
      if (topicsContainerRef.current && !topicsContainerRef.current.contains(target)) {
        setTopicsOpen(false);
      }
      if (levelContainerRef.current && !levelContainerRef.current.contains(target)) {
        setLevelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [topicsOpen, levelOpen]);

  /* Wheel on level trigger: scroll up = next level, scroll down = prev */
  useEffect(() => {
    const trigger = levelTriggerRef.current;
    if (!trigger) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const i = LEVEL_ORDER.indexOf(levelFilter);
      if (e.deltaY < 0) {
        setLevelFilter(LEVEL_ORDER[(i + 1) % LEVEL_ORDER.length]);
      } else {
        setLevelFilter(LEVEL_ORDER[(i - 1 + LEVEL_ORDER.length) % LEVEL_ORDER.length]);
      }
    };
    trigger.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => trigger.removeEventListener("wheel", handleWheel, { capture: true });
  }, [levelFilter]);

  const levelTriggerPointerDown = useCallback((clientY: number) => {
    levelTriggerDragRef.current = {
      startY: clientY,
      isDrag: false,
      lastY: clientY,
      accum: 0,
    };

    const applyStep = (delta: number) => {
      const i = LEVEL_ORDER.indexOf(levelFilterRef.current);
      const next = (i + delta + LEVEL_ORDER.length) % LEVEL_ORDER.length;
      setLevelFilter(LEVEL_ORDER[next]);
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      const state = levelTriggerDragRef.current;
      if (!state) return;
      const clientY =
        "touches" in e && e.touches[0]
          ? e.touches[0].clientY
          : (e as MouseEvent).clientY;
      const dy = clientY - state.lastY;

      if (!state.isDrag && Math.abs(clientY - state.startY) >= LEVEL_DRAG_THRESHOLD_PX) {
        state.isDrag = true;
        setLevelTriggerDragging(true);
      }
      if (state.isDrag) {
        state.accum += dy;
        while (state.accum >= LEVEL_DRAG_STEP_PX) {
          applyStep(-1);
          state.accum -= LEVEL_DRAG_STEP_PX;
        }
        while (state.accum <= -LEVEL_DRAG_STEP_PX) {
          applyStep(1);
          state.accum += LEVEL_DRAG_STEP_PX;
        }
        state.lastY = clientY;
      }
    };

    const onUp = () => {
      const wasDrag = levelTriggerDragRef.current?.isDrag ?? false;
      levelTriggerDragRef.current = null;
      setLevelTriggerDragging(false);
      document.removeEventListener("mousemove", onMove as (e: MouseEvent) => void);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove as (e: TouchEvent) => void, { capture: true });
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("touchcancel", onUp);
      if (!wasDrag) setLevelOpen((o) => !o);
    };

    document.addEventListener("mousemove", onMove as (e: MouseEvent) => void);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove as (e: TouchEvent) => void, { passive: false, capture: true });
    document.addEventListener("touchend", onUp);
    document.addEventListener("touchcancel", onUp);
  }, []);

  const onLevelTriggerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      levelTriggerPointerDown(e.clientY);
    },
    [levelTriggerPointerDown]
  );

  const onLevelTriggerTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches[0]) levelTriggerPointerDown(e.touches[0].clientY);
    },
    [levelTriggerPointerDown]
  );

  const goBackToHome = useCallback(() => {
    setSubjectFilter(null);
    setSelectedPaper(null);
    setSelectedImageTopic(null);
  }, []);

  return (
    <div className="practice-hub w-full min-h-full h-full flex flex-col overflow-x-hidden px-10 pb-3 scrollbar-minimal">
      <div className="practice-hub__inner flex flex-col flex-1 w-full min-h-0">
        {/* Top bar: subject (oval) left, search right */}
        <section className="topBar flex flex-shrink-0 items-center justify-between w-full mb-1">
          <div className="practice-hub__subject-wrap">
            {subjectFilter != null && (
              <button
                type="button"
                onClick={goBackToHome}
                className="practice-hub__back-btn"
                aria-label="Back to home"
                title="Back"
              >
                <LuArrowLeft size={20} aria-hidden />
              </button>
            )}
            <div className="practice-hub__subject-field practice-hub__subject-field--oval">
              <SubjectDropdown
                value={subjectFilter}
                onChange={(id) => {
                  if (id) handleSubjectSelect(id);
                  else setSubjectFilter(null);
                }}
                id="ph-subject"
                onFavouritesChange={onFavouritesChange}
              />
            </div>
          </div>
          <div ref={globalSearchContainerRef} className="flex items-center txtbox color-bg w-1/4 max-w-80 rounded-out min-w-0 relative ml-auto">
            <input
              type="text"
              className="w-full p-1 outline-none border-none color-txt-main"
              placeholder="Search all questions…"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              onFocus={() => setGlobalSearchOpen(true)}
              aria-label="Search all questions"
              aria-expanded={globalSearchOpen}
              aria-controls="ph-global-search-results"
            />
            <LuSearch className="color-txt-sub shrink-0 ml-1 mr-1" size={20} aria-hidden />
            {globalSearchOpen && (
              <div
                id="ph-global-search-results"
                className="practice-hub__search-results"
                role="listbox"
              >
                {globalSearchLoading ? (
                  <div className="practice-hub__search-loading txt-sub color-txt-sub py-3 px-2">
                    Loading questions…
                  </div>
                ) : globalSearchQuery.trim() ? (
                  globalSearchResults.length === 0 ? (
                    <div className="practice-hub__search-empty txt-sub color-txt-sub py-3 px-2">
                      No questions match
                    </div>
                  ) : (
                    globalSearchResults.map((entry) => {
                      const key = entry.imageMode
                        ? `img-${entry.imageTopic}-${entry.imageKey}`
                        : `${entry.paper ? getExamPaperKey(entry.paper) : "p"}-${entry.question?.id ?? ""}-${entry.indexInPaper}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="option"
                          className="practice-hub__search-result"
                          onClick={() => goToQuestion(entry)}
                        >
                          <span className="practice-hub__search-result-name txt-bold color-txt-main">
                            {entry.questionName}
                          </span>
                          {entry.tagsStr ? (
                            <span className="practice-hub__search-result-tags txt-sub color-txt-sub text-xs">
                              {entry.tagsStr}
                            </span>
                          ) : null}
                          <span className="practice-hub__search-result-paper txt-sub color-txt-sub text-xs italic">
                            {entry.paperLabel}
                          </span>
                        </button>
                      );
                    }))
                ) : (
                  <div className="practice-hub__search-hint txt-sub color-txt-sub py-3 px-2">
                    Type to search across all questions
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Filter section – only visible when a subject is selected */}
        {subjectFilter != null && (
        <section className="practice-hub__filter-section pb-2 w-full flex-shrink-0 mb-2" aria-label="Filters">
            <div className="practice-hub__filter-toolbar flex items-center flex-wrap gap-2 min-w-0">
            <h2 className="txt-heading-colour text-xl font-bold mr-1 shrink-0">
              {isImageMode ? "Practice Questions" : "State Exam Papers"}
            </h2>

            {!isImageMode && (
              <YearClockPicker
                value={yearFilter}
                onChange={setYearFilter}
                id="ph-year"
                aria-label="Filter by year"
              />
            )}

            {/* Level dropdown: HL→higher, OL→ordinary, FD→foundation, all→level */}
            <div ref={levelContainerRef} className="practice-hub__level-wrap relative">
              <button
                ref={levelTriggerRef}
                type="button"
                className={`practice-hub__level-trigger flex color-txt-sub font-bold py-0.5 px-2 items-center justify-center rounded-out color-bg-grey-5 gap-1 cursor-pointer border-0 ${levelTriggerDragging ? "practice-hub__level-trigger--dragging" : ""}`}
                onMouseDown={onLevelTriggerMouseDown}
                onTouchStart={onLevelTriggerTouchStart}
                aria-expanded={levelOpen}
                aria-haspopup="listbox"
                aria-label="Filter by level"
              >
                <span>
                  {LEVEL_OPTIONS.find((o) => o.value === levelFilter)?.display ?? "level"}
                </span>
                <span className="practice-hub__level-chevrons" aria-hidden>
                  <LuChevronUp size={14} className="color-txt-sub" />
                  <LuChevronDown size={14} className="color-txt-sub" />
                </span>
              </button>
              {levelOpen && (
                <div
                  className="practice-hub__level-panel color-bg rounded-out border-2"
                  role="listbox"
                  aria-label="Level"
                >
                  {(isImageMode
                    ? LEVEL_OPTIONS.filter(
                        (opt) => opt.value !== "all" && imageLevels.includes(opt.value)
                      )
                    : LEVEL_OPTIONS
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={levelFilter === opt.value}
                      className={`practice-hub__level-option w-full flex items-center justify-between rounded-in px-3 py-2 text-left border-0 cursor-pointer text-sm ${
                        levelFilter === opt.value
                          ? "color-bg-accent color-txt-accent"
                          : "color-txt-main hover:color-bg-grey-5"
                      }`}
                      onClick={() => {
                        setLevelFilter(opt.value);
                        setLevelOpen(false);
                      }}
                    >
                      <span className="txt-bold">{opt.code}</span>
                      <span className={levelFilter === opt.value ? "" : "color-txt-sub"}>
                        {opt.display}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!isImageMode && (
              <div className="flex items-center justify-center color-txt-sub font-bold py-1 px-3 rounded-in">
                <p className="mr-1 font-normal">Paper</p>
                <button
                  type="button"
                  className={`cursor-pointer transition-all duration-200 rounded-full w-6 h-6 flex items-center justify-center border-0  ${paperFilter === "1" ? "color-bg-accent color-txt-accent" : "color-txt-sub hover:color-bg-grey-5"}`}
                  onClick={() => setPaperFilter(paperFilter === "1" ? "all" : "1")}
                  aria-pressed={paperFilter === "1"}
                  aria-label="Paper 1 only"
                >
                  1
                </button>
                <button
                  type="button"
                  className={`cursor-pointer transition-all duration-200 rounded-full w-6 h-6 flex items-center justify-center border-0 ${paperFilter === "2" ? "color-bg-accent color-txt-accent" : "color-txt-sub hover:color-bg-grey-5"}`}
                  onClick={() => setPaperFilter(paperFilter === "2" ? "all" : "2")}
                  aria-pressed={paperFilter === "2"}
                  aria-label="Paper 2 only"
                >
                  2
                </button>
              </div>
            )}

            {isImageMode && (
              <h3 className="txt-heading-colour text-xl font-bold shrink-0">Set</h3>
            )}
            </div>

            <div className="practice-hub__filter-aside flex items-center justify-between gap-2 min-w-0 pl-3">
              <h3 className="txt-heading-colour text-xl font-bold shrink-0">Topic</h3>
              <button
                type="button"
                onClick={resetAllFilters}
                className="flex items-center justify-center p-1.5 rounded-out color-txt-sub hover:color-txt-main hover:color-bg-grey-5 border-0 cursor-pointer shrink-0"
                aria-label="Reset all filters"
              >
                <LuTrash2 size={18} aria-hidden />
              </button>
            </div>
        </section>
        )}

        {/* Results: deck-grid + paper/topic cards – fills remaining height.
            We hide overflow at this level and let the inner column lists
            (paper grid, topic list) own their own vertical scroll. */}
        <div className="flex-1 w-full min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
          {(subjectFilter != null && papersLoading) || (isImageMode && imageTopicsLoading) ? (
            <motion.div
              key="skeleton"
              className="deck-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {[...Array(4)].map((_, i) => (
                <div key={i} className="deck flex flex-col">
                  <div className="color-border" />
                  <div className="image color-bg-grey-5 animate-pulse" />
                  <div className="flex w-full z-50 mt-21 px-3 py-2 items-center color-bg-grey-5 animate-pulse rounded-b-2xl h-14" />
                </div>
              ))}
            </motion.div>
          ) : subjectFilter == null ? (
            <motion.div
              key="home"
              className="w-full min-h-0 overflow-y-auto scrollbar-minimal pb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {favouriteSubjects.length > 0 ? (
                <>
                  <h2 className="txt-heading-colour text-xl font-bold mb-3">Your Subjects</h2>
                  <div className="deck-grid">
                    {favouriteSubjects.map((s, i) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.03, ease: "easeOut" }}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSubjectSelect(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSubjectSelect(s.id);
                            }
                          }}
                          className="deck paper-card practice-hub__subject-card flex flex-col color-bg"
                        >
                          <div className="color-border" />
                          <SubjectIconImage subjectId={s.id} />
                          <div className="practice-hub__paper-card-body">
                            <div className="flex w-full z-50 items-center">
                              <div className="flex flex-col ml-1 min-w-0 flex-1">
                                <span className="txt-heading-colour truncate">{s.label}</span>
                              </div>
                              <LuChevronRight size={18} className="color-txt-sub shrink-0" aria-hidden />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="min-h-[280px] w-full flex items-center justify-center px-4 mb-6">
                  <div className="max-w-xl text-center">
                    <LuStar size={40} className="color-txt-sub opacity-40 mx-auto mb-3" />
                    <p className="txt-heading-colour text-2xl font-bold mb-2">No favourite subjects yet</p>
                    <p className="txt-sub color-txt-sub mb-5">
                      Star your favourite subjects and they'll appear here for quick access.
                    </p>
                    <div className="flex justify-center">
                      <button
                        type="button"
                        className="blue-btn px-5 py-2.5"
                        onClick={openSubjectPicker}
                      >
                        Choose a subject
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <section
                className="practice-hub__predictions mt-8"
                aria-label="Predictions"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <LuSparkles size={20} className="color-txt-accent shrink-0" aria-hidden />
                    <h2 className="txt-heading-colour text-xl font-bold">Predictions</h2>
                  </div>
                  <button
                    type="button"
                    className="blue-btn !w-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm shrink-0"
                    onClick={openPredictionModal}
                  >
                    <LuSparkles size={16} aria-hidden />
                    Generate
                  </button>
                </div>
                {predictionsLoading ? (
                  <div className="deck-grid">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="deck flex flex-col">
                        <div className="color-border" />
                        <div className="image color-bg-grey-5 animate-pulse" />
                        <div className="flex w-full z-50 mt-21 px-3 py-2 items-center color-bg-grey-5 animate-pulse rounded-b-2xl h-14" />
                      </div>
                    ))}
                  </div>
                ) : predictionPapers.length === 0 ? (
                  <p className="txt-sub color-txt-sub py-2">
                    Exam predictions will appear here when available.
                  </p>
                ) : (
                  <div className="deck-grid">
                    {predictionPapers.map((paper, i) => {
                      const isHighlightTarget =
                        highlightPaperReady && paper.id === tutorialHighlightPaper?.id;

                      return (
                        <motion.div
                          key={getExamPaperKey(paper)}
                          ref={isHighlightTarget ? assignTutorialCardAnchorRef : undefined}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.03, ease: "easeOut" }}
                        >
                          {paper.contentType === "image" ? (
                            <ImagePredictionCard
                              paper={paper}
                              accessLabel={getContentAccessLabel(
                                user,
                                canAccessPaper(user, paper, freePaperKeys)
                              )}
                              onSelect={() => handlePredictionSelect(paper)}
                            />
                          ) : (
                            <PaperCard
                              paper={paper}
                              getPaperBlob={getPredictionPaperPreviewBlob}
                              accessLabel={getContentAccessLabel(
                                user,
                                canAccessPaper(user, paper, freePaperKeys)
                              )}
                              onSelect={() => handlePredictionSelect(paper)}
                            />
                          )}
                          <p className="txt-sub color-txt-sub text-xs mt-1.5 px-1 truncate">
                            {getSubjectLabel(paper.subject ?? "")} · {formatLevelDisplay(paper.level)}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </section>
            </motion.div>
          ) : isImageMode ? (
            imageTopicsError ? (
              <motion.p key="error" className="txt-sub color-txt-sub py-4 ml-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                No questions available for this subject yet.
              </motion.p>
            ) : imageTopics.length === 0 ? (
              <motion.p key="no-topics" className="txt-sub color-txt-sub py-4 ml-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                No topics found for the selected level.
              </motion.p>
            ) : (
              <motion.div
                key={`topics-${subjectFilter}`}
                className="practice-hub__split"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="practice-hub__split-body">
                  <section className="practice-hub__split-column">
                    <div className="practice-hub__paper-grid">
                      {imageTopics.map((topic, i) => (
                        <motion.div
                          key={topic.path}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.03, ease: "easeOut" }}
                        >
                          <TopicCard
                            topic={topic}
                            levelLabel={formatLevelDisplay(activeImageLevel)}
                            accessLabel={getContentAccessLabel(
                              user,
                              isImageTopicContentFree(topic, starterImageTopic, storageFolderName)
                            )}
                            onSelect={() => {
                              setSelectedImageTopic(topic);
                            }}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </section>

                  <section className="practice-hub__split-column">
                    <div className="practice-hub__topic-list color-bg-grey-5">
                      {imageTopicEntries.map((entry) => (
                        <button
                          key={entry.topic.path}
                          type="button"
                          className="practice-hub__topic-list-item"
                          onClick={() => goToImageTopicSession(entry.topic)}
                        >
                          <span className="txt color-txt-main">{entry.label}</span>
                          <span className="txt-sub color-txt-sub">
                            {formatLevelDisplay(activeImageLevel)} · {entry.questionCount} question{entry.questionCount !== 1 ? "s" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              </motion.div>
            )
          ) : filteredPapers.length === 0 ? (
            <motion.p key="no-papers" className="txt-sub color-txt-sub py-4 ml-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              No papers match the selected filters.
            </motion.p>
          ) : (
            <motion.div
              key={`papers-${subjectFilter}`}
              className="practice-hub__split"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="practice-hub__split-body">
              <section className="practice-hub__split-column">
                <div className="practice-hub__paper-grid">
                  {filteredPapers.map((paper, i) => (
                    <motion.div
                      key={getExamPaperKey(paper)}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03, ease: "easeOut" }}
                    >
                      <PaperCard
                        paper={paper}
                        getPaperBlob={getPaperBlob}
                        questionCount={paperQuestionCountMap[getExamPaperKey(paper)]}
                        tags={paperTagsMap[getExamPaperKey(paper)] ?? []}
                        accessLabel={getContentAccessLabel(
                          user,
                          canAccessPaper(user, paper, freePaperKeys)
                        )}
                        onSelect={() => {
                          setSelectedPaper(paper);
                          setPanelAnimationDone(false);
                        }}
                      />
                    </motion.div>
                  ))}
                </div>
              </section>

              <section className="practice-hub__split-column">
                <div className="practice-hub__topic-list color-bg-grey-5">
                  {topicEntries.length === 0 ? (
                    <p className="txt-sub color-txt-sub px-3 py-3">No topics found for the current filters.</p>
                  ) : (
                    topicEntries.map((topic) => (
                      <button
                        key={topic.normalized}
                        type="button"
                        className="practice-hub__topic-list-item"
                        onClick={() => goToPastPaperTopicSession(topic.label)}
                      >
                        <span className="txt color-txt-main">{topic.label}</span>
                        <span className="txt-sub color-txt-sub">{topic.paperCount} paper{topic.paperCount !== 1 ? "s" : ""}</span>
                      </button>
                    ))
                  )}
                </div>
              </section>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      {/* Slide-in preview panels — portalled to #themed-root so theme variants apply
          and they escape ancestor stacking/transform (e.g. sidebar flex). */}
      {createPortal(
      <AnimatePresence>
        {selectedPaper && (
          <>
            <motion.div
              className="practice-hub__backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              onClick={() => setSelectedPaper(null)}
              aria-hidden
            />
            <motion.aside
              className="practice-hub__panel color-bg"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "tween",
                duration: 0.35,
                ease: [0.32, 0.72, 0, 1],
              }}
              onAnimationComplete={() => setPanelAnimationDone(true)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ph-panel-title"
            >
                <div className="absolute top-1 right-1">
                  <button
                      type="button"
                      onClick={() => setSelectedPaper(null)}
                      className="practice-hub__panel-close"
                      aria-label="Close"
                    >
                      <LuX size={24} />
                  </button>

                </div>
         
                <div className="practice-hub__panel-preview">
                  <div className="practice-hub__preview-wrap">
                    <FullPaperPreview blob={previewBlob} />
                  </div>
                </div>

                <div className="practice-hub__panel-inner">
                <header className="practice-hub__panel-header">
                  <h2 id="ph-panel-title" className="practice-hub__panel-title txt-heading-colour">
                    {selectedPaper.label}
                  </h2>
       
                </header>

                <p className="practice-hub__panel-meta color-txt-sub text-sm">
                  <span>{selectedPaper.year ?? "—"}</span>
                  <span className="practice-hub__panel-meta-sep" aria-hidden> · </span>
                  <span>{formatLevelDisplay(selectedPaper.level)}</span>
                  <span className="practice-hub__panel-meta-sep" aria-hidden> · </span>
                  <span>Paper {getPaperNumber(selectedPaper) ?? "—"}</span>
                </p>

                {allTagsInPreview.length > 0 && (
                  <div className="practice-hub__panel-tags" ref={panelTagsContainerRef}>
                    {panelTagsExpanded ? (
                      <div className="practice-hub__panel-tags-list flex flex-wrap gap-2">
                        {allTagsInPreview.map((tag) => (
                          <span key={tag} className="color-bg-accent color-txt-accent rounded-in px-1.5 py-0.5 text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="practice-hub__panel-tags-list flex flex-nowrap gap-2" aria-hidden={tagsVisibleWhenCollapsed < allTagsInPreview.length}>
                          {allTagsInPreview.slice(0, tagsVisibleWhenCollapsed).map((tag) => (
                            <span key={tag} className="color-bg-accent color-txt-accent rounded-in px-1.5 py-0.5 text-xs shrink-0">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div
                          ref={panelTagsMeasureRef}
                          className="practice-hub__panel-tags-measure flex flex-nowrap gap-2"
                          aria-hidden
                        >
                          {allTagsInPreview.map((tag) => (
                            <span key={tag} className="color-bg-accent color-txt-accent rounded-in px-1.5 py-0.5 text-xs shrink-0">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {(panelTagsExpanded || allTagsInPreview.length > tagsVisibleWhenCollapsed) && (
                      <button
                        type="button"
                        onClick={() => setPanelTagsExpanded((v) => !v)}
                        className="practice-hub__panel-tags-toggle mt-2 text-xs font-medium color-txt-sub hover:color-txt focus:outline-none focus:underline"
                      >
                        {panelTagsExpanded ? "See less" : "See more"}
                      </button>
                    )}
                  </div>
                )}

                <div className="practice-hub__panel-actions-spacer" aria-hidden />
              </div>
              <div className="practice-hub__panel-actions color-bg">
                <button
                  type="button"
                  onClick={goToSession}
                  className="blue-btn w-full flex items-center justify-center gap-2 py-3"
                >
                  Let&apos;s go
                  <LuChevronRight size={20} />
                </button>
              </div>
            </motion.aside>
          </>
        )}
        {selectedImageTopic && (
          <>
            <motion.div
              className="practice-hub__backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              onClick={() => setSelectedImageTopic(null)}
              aria-hidden
            />
            <motion.aside
              className="practice-hub__panel color-bg"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "tween",
                duration: 0.35,
                ease: [0.32, 0.72, 0, 1],
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ph-topic-panel-title"
            >
                <div className="absolute top-1 right-1">
                  <button
                      type="button"
                      onClick={() => setSelectedImageTopic(null)}
                      className="practice-hub__panel-close"
                      aria-label="Close"
                    >
                      <LuX size={24} />
                  </button>
                </div>

                <div className="practice-hub__panel-preview">
                  <div className="practice-hub__preview-wrap">
                    {selectedImageTopic.thumbnailUrl ? (
                      <div className="practice-hub__preview-box rounded-in overflow-hidden border border-[var(--color-grey)]/20">
                        <img
                          src={selectedImageTopic.thumbnailUrl}
                          alt={selectedImageTopic.displayName}
                          className="practice-hub__preview-img"
                        />
                      </div>
                    ) : (
                      <div className="practice-hub__preview-box color-bg-grey-5 rounded-in flex items-center justify-center color-txt-sub text-sm">
                        No preview
                      </div>
                    )}
                  </div>
                </div>

                <div className="practice-hub__panel-inner">
                  <header className="practice-hub__panel-header">
                    <h2 id="ph-topic-panel-title" className="practice-hub__panel-title txt-heading-colour">
                      {selectedImageTopic.displayName}
                    </h2>
                  </header>

                  <p className="practice-hub__panel-meta color-txt-sub text-sm">
                    <span>{selectedImageTopic.questionCount} question{selectedImageTopic.questionCount !== 1 ? "s" : ""}</span>
                    <span className="practice-hub__panel-meta-sep" aria-hidden> · </span>
                    <span>{formatLevelDisplay(activeImageLevel)}</span>
                  </p>

                  <div className="practice-hub__panel-actions-spacer" aria-hidden />
                </div>
                <div className="practice-hub__panel-actions color-bg">
                  <button
                    type="button"
                    onClick={goToImageSession}
                    className="blue-btn w-full flex items-center justify-center gap-2 py-3"
                  >
                    Let&apos;s go
                    <LuChevronRight size={20} />
                  </button>
                </div>
            </motion.aside>
          </>
        )}
        {selectedPrediction && (
          <>
            <motion.div
              className="practice-hub__backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              onClick={() => setSelectedPrediction(null)}
              aria-hidden
            />
            <motion.aside
              className="practice-hub__panel color-bg"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "tween",
                duration: 0.35,
                ease: [0.32, 0.72, 0, 1],
              }}
              onAnimationComplete={() => setPredictionPanelAnimationDone(true)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ph-prediction-panel-title"
            >
              <div className="absolute top-1 right-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPredictionDeleteConfirm(true)}
                  className="practice-hub__panel-close practice-hub__panel-delete"
                  aria-label="Delete prediction"
                  disabled={predictionDeleting}
                >
                  <LuTrash2 size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPrediction(null)}
                  className="practice-hub__panel-close"
                  aria-label="Close"
                >
                  <LuX size={24} />
                </button>
              </div>

              <div className="practice-hub__panel-inner">
                <header className="practice-hub__panel-header">
                  <h2 id="ph-prediction-panel-title" className="practice-hub__panel-title txt-heading-colour flex items-center gap-2">
                    <LuSparkles size={18} className="color-txt-accent shrink-0" aria-hidden />
                    {selectedPrediction.label}
                  </h2>
                </header>

                <p className="practice-hub__panel-meta color-txt-sub text-sm">
                  <span>{getSubjectLabel(selectedPrediction.subject ?? "")}</span>
                  <span className="practice-hub__panel-meta-sep" aria-hidden> · </span>
                  <span>{formatLevelDisplay(selectedPrediction.level)}</span>
                  {selectedPrediction.contentType !== "image" && getPaperNumber(selectedPrediction) != null && (
                    <>
                      <span className="practice-hub__panel-meta-sep" aria-hidden> · </span>
                      <span>Paper {getPaperNumber(selectedPrediction)}</span>
                    </>
                  )}
                </p>

                <div className="practice-hub__prediction-questions mt-3">
                  {predictionQuestionsLoading ? (
                    <div className="practice-hub__prediction-questions-loading color-txt-sub text-sm py-4">
                      Loading questions…
                    </div>
                  ) : selectedPrediction.contentType === "image" ? (
                    predictionImageQuestions.length === 0 ? (
                      <p className="color-txt-sub text-sm py-2">No questions in this prediction.</p>
                    ) : (
                      <ul className="practice-hub__prediction-questions-list">
                        {predictionImageQuestions.map((q, i) => (
                          <PredictionImageQuestionItem
                            key={q.id}
                            question={q}
                            index={i}
                          />
                        ))}
                      </ul>
                    )
                  ) : predictionQuestions.length === 0 ? (
                    <p className="color-txt-sub text-sm py-2">No questions in this prediction.</p>
                  ) : (
                    <ul className="practice-hub__prediction-questions-list">
                      {predictionQuestions.map((q, i) => (
                        <PredictionPaperQuestionItem
                          key={q.id}
                          paper={selectedPrediction}
                          question={q}
                          index={i}
                          getPaperBlobForQuestion={getPaperBlobForQuestion}
                        />
                      ))}
                    </ul>
                  )}
                </div>

                <div className="practice-hub__panel-actions-spacer" aria-hidden />
              </div>
              <div className="practice-hub__panel-actions color-bg">
                {predictionDeleteConfirm ? (
                  <div className="practice-hub__panel-delete-confirm">
                    <p className="txt color-txt-main text-sm">
                      Delete this prediction? This can&apos;t be undone.
                    </p>
                    <div className="practice-hub__panel-delete-actions">
                      <button
                        type="button"
                        onClick={() => setPredictionDeleteConfirm(false)}
                        className="practice-hub__panel-delete-cancel"
                        disabled={predictionDeleting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeletePrediction}
                        className="practice-hub__panel-delete-confirm-btn"
                        disabled={predictionDeleting}
                      >
                        <LuTrash2 size={16} aria-hidden />
                        {predictionDeleting ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPrediction) goToPaperSession(selectedPrediction);
                    }}
                    className="blue-btn w-full flex items-center justify-center gap-2 py-3"
                  >
                    Let&apos;s go
                    <LuChevronRight size={20} />
                  </button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>,
      getThemedPortalTarget()
      )}

      {/* Paper pro gate modal – when non-pro tries to open locked paper */}
      {showContentGateModal && (
        <ContentProGate
          freePaper={isImageMode ? null : firstFreePaper}
          freeImageSample={isImageMode ? freeImageSample : null}
          asModal
          onClose={() => setShowContentGateModal(false)}
        />
      )}

      {showPredictionModal &&
        createPortal(
          <>
            <div
              className={`practice-hub__backdrop${isModalTutorialStep ? " practice-hub__backdrop--tutorial" : ""}`}
              onClick={closePredictionModal}
              aria-hidden
            />
            <div
              className={`practice-hub__prediction-modal-wrap${isModalTutorialStep ? " practice-hub__prediction-modal-wrap--tutorial" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ph-prediction-modal-title"
              onClick={closePredictionModal}
            >
              <div className="practice-hub__prediction-modal-stage">
                <AnimatePresence>
                  {isModalTutorialStep && tutorialStep !== null ? (
                    <PredictionTutorialCallout key="prediction-tutorial" step={tutorialStep} />
                  ) : null}
                </AnimatePresence>
                <div
                  className="practice-hub__prediction-modal color-bg"
                  onClick={(e) => e.stopPropagation()}
                >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 id="ph-prediction-modal-title" className="txt-heading-colour text-xl font-bold">
                    Generate prediction
                  </h2>
                  <button
                    type="button"
                    className="practice-hub__panel-close"
                    onClick={closePredictionModal}
                    aria-label="Close"
                  >
                    <LuX size={24} />
                  </button>
                </div>

                <div className="prediction-flow__controls-row prediction-flow__controls-row--modal mb-5">
                  <div className="prediction-flow__field">
                    <label className="prediction-flow__label color-txt-sub">Subject</label>
                    <select
                      value={predictionSubject}
                      onChange={(e) => setPredictionSubject(e.target.value)}
                      className={PREDICTION_SELECT_CLASS}
                    >
                      {PRACTICE_HUB_SUBJECTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="prediction-flow__field">
                    <label className="prediction-flow__label color-txt-sub">Level</label>
                    <select
                      value={predictionLevel}
                      onChange={(e) => setPredictionLevel(e.target.value)}
                      className={PREDICTION_SELECT_CLASS}
                    >
                      <option value="higher">Higher</option>
                      <option value="ordinary">Ordinary</option>
                    </select>
                  </div>
                  {predictionUsesPastPapers && (
                    <div className="prediction-flow__field">
                      <label className="prediction-flow__label color-txt-sub">Paper</label>
                      <select
                        value={predictionPaper}
                        onChange={(e) => setPredictionPaper(Number(e.target.value) as 1 | 2)}
                        className={PREDICTION_SELECT_CLASS}
                      >
                        <option value={1}>Paper 1</option>
                        <option value={2}>Paper 2</option>
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => predictionFlowRef.current?.generate()}
                    disabled={predictionGenerating}
                    className="blue-btn prediction-flow__generate-btn"
                  >
                    <LuSparkles size={18} aria-hidden className={predictionGenerating ? "animate-spin" : ""} />
                    {predictionGenerating ? "Generating…" : "Generate prediction"}
                  </button>
                </div>

                <GeneratePredictionFlow
                  ref={predictionFlowRef}
                  key={`${predictionSubject}-${predictionLevel}-${predictionPaper}`}
                  subject={predictionSubject}
                  level={predictionLevel}
                  paperNumber={predictionPaper}
                  onPaperNumberChange={setPredictionPaper}
                  embeddedControls
                  onLoadingChange={setPredictionGenerating}
                  onBlueprintReady={() => {
                    setTutorialStep((current) => (current === 1 ? 2 : current));
                  }}
                  onSaved={(paperId) => {
                    setPapersReloadKey((k) => k + 1);
                    setShowPredictionModal(false);
                    if (tutorialStepRef.current === 1 || tutorialStepRef.current === 2) {
                      setTutorialHighlightPaperId(paperId);
                      setTutorialStep(3);
                    }
                  }}
                />
                </div>
              </div>
            </div>
          </>,
          getThemedPortalTarget()
        )}

      {cardTutorialUiReady && cardSpotlightRect ? (
        <>
          <PredictionCardTutorialScrim anchorRect={cardSpotlightRect} />
          <PredictionCardTutorialCallout anchorRect={cardSpotlightRect} />
        </>
      ) : null}

    </div>
  );
}

/** Tags on card: one line only; show first N then "see more" */
const TAGS_VISIBLE_ON_CARD = 3;

function ContentAccessBadge({ label }: { label: ContentAccessLabel }) {
  if (label === "free") {
    return <span className="practice-hub__access-badge practice-hub__access-badge--free">Free</span>;
  }
  return (
    <span className="practice-hub__access-badge practice-hub__access-badge--locked">
      <LuLock size={10} aria-hidden />
      ACE
    </span>
  );
}

/** Prediction card for image-based subjects (thumbnail from Storage, not PDF). */
function ImagePredictionCard({
  paper,
  onSelect,
  accessLabel,
}: {
  paper: ExamPaper;
  onSelect: () => void;
  accessLabel?: ContentAccessLabel | null;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || loaded.current || !paper.storagePath) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loaded.current = true;
        getDownloadURL(storageRef(storage, paper.storagePath))
          .then(setThumbUrl)
          .catch(() => {});
      },
      { rootMargin: "100px", threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [paper.storagePath]);

  const levelLabel = formatLevelDisplay(paper.level);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="deck paper-card flex flex-col"
    >
      <div className="color-border" />
      <div className="image overflow-hidden relative">
        {accessLabel && (
          <div className="absolute top-2 right-2 z-10">
            <ContentAccessBadge label={accessLabel} />
          </div>
        )}
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center color-txt-sub text-xs">
            <LuSparkles size={20} className="opacity-50" aria-hidden />
          </div>
        )}
      </div>
      <div className="bg-overlay" />
      <div className="flex w-full z-50 mt-21 px-3 py-2 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="txt-heading-colour font-bold text-sm truncate">{paper.label}</p>
          <p className="txt-sub color-txt-sub text-xs">{levelLabel} · Image prediction</p>
        </div>
      </div>
    </div>
  );
}

/** Paper card – deck styling (shadow-small, color-border, txt-heading-colour, blue-btn tags) */
function PaperCard({
  paper,
  getPaperBlob,
  questionCount = 0,
  tags = [],
  onSelect,
  accessLabel,
}: {
  paper: ExamPaper;
  getPaperBlob: (p: ExamPaper) => Promise<Blob>;
  questionCount?: number;
  tags?: string[];
  onSelect: () => void;
  accessLabel?: ContentAccessLabel | null;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || loaded.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loaded.current = true;
        getPaperBlob(paper).then(setBlob).catch(() => {});
      },
      { rootMargin: "100px", threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [paper, getPaperBlob]);

  const snapshot = usePaperSnapshot(blob, 1);
  const levelLabel = formatLevelDisplay(paper.level);
  const visibleTags = tags.slice(0, TAGS_VISIBLE_ON_CARD);
  const hasMoreTags = tags.length > TAGS_VISIBLE_ON_CARD;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="deck paper-card flex flex-col"
    >

      <div className="color-border" />
      <div className="image overflow-hidden relative">
        {accessLabel && (
          <div className="absolute top-2 right-2 z-10">
            <ContentAccessBadge label={accessLabel} />
          </div>
        )}
        {snapshot ? (
          <img src={snapshot} alt="" className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center color-txt-sub text-xs">
            {blob ? "Loading…" : "—"}
          </div>
        )}
      </div>
      {/* Same as decks: gradient overlay that goes up into the image */}
      <div className="bg-overlay" />
      <div className="practice-hub__paper-card-body">
      <div className="flex w-full z-50 items-center">
        <LuFileCheck size={18} className="color-txt-accent shrink-0" aria-hidden />
        <div className="flex flex-col ml-2 min-w-0 flex-1">
          <span className="txt-heading-colour truncate">{paper.label}</span>
          <span className="txt color-txt-sub">{levelLabel}</span>
        </div>
        <div className="ml-auto flex flex-col items-end justify-end shrink-0">
          <span className="txt color-txt-sub">
            {questionCount} question{questionCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      {/* Tags: one line only; "see more" opens side panel for all tags */}
      {tags.length > 0 && (
        <div className="practice-hub__paper-card-tags mt-1.5 relative z-50">
          {visibleTags.map((tag) => (
            <span key={tag} className="practice-hub__paper-card-tag-pill blue-btn color-bg-grey-5 font-semibold">
              {tag}
            </span>
          ))}
          {hasMoreTags && (
            <button
              type="button"
              className="practice-hub__paper-card-tags-seemore"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              see more
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/** Topic card for image-based subjects */
function TopicCard({
  topic,
  levelLabel,
  onSelect,
  accessLabel,
}: {
  topic: ImageTopic;
  levelLabel: string;
  onSelect: () => void;
  accessLabel?: ContentAccessLabel | null;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="deck paper-card flex flex-col"
    >
      <div className="color-border" />
      <div className="image overflow-hidden flex items-center justify-center relative">
        {accessLabel && (
          <div className="absolute top-2 right-2 z-10">
            <ContentAccessBadge label={accessLabel} />
          </div>
        )}
        {topic.thumbnailUrl ? (
          <img src={topic.thumbnailUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center color-txt-sub text-xs">
            <LuImage size={32} className="color-txt-sub opacity-40" />
          </div>
        )}
      </div>
      <div className="bg-overlay" />
      <div className="practice-hub__paper-card-body">
        <div className="flex w-full z-50 items-center">
          <LuImage size={18} className="color-txt-accent shrink-0" aria-hidden />
          <div className="flex flex-col ml-2 min-w-0 flex-1">
            <span className="txt-heading-colour truncate">{topic.displayName}</span>
            <span className="txt color-txt-sub">{levelLabel}</span>
          </div>
          <div className="ml-auto flex flex-col items-end justify-end shrink-0">
            <span className="txt color-txt-sub">
              {topic.questionCount} question{topic.questionCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One question in the prediction slide-in panel (past-paper style). Lazy-loads source PDF and renders the cropped region. */
function PredictionPaperQuestionItem({
  paper,
  question,
  index,
  getPaperBlobForQuestion,
}: {
  paper: ExamPaper;
  question: PaperQuestion;
  index: number;
  getPaperBlobForQuestion: (p: ExamPaper, q: PaperQuestion) => Promise<Blob>;
}) {
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const itemRef = useRef<HTMLLIElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const [snippetWidth, setSnippetWidth] = useState(320);

  useEffect(() => {
    const el = itemRef.current;
    if (!el || loaded.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loaded.current = true;
        getPaperBlobForQuestion(paper, question)
          .then(setSourceBlob)
          .catch((err) => console.warn("Prediction question PDF load failed:", err));
      },
      { rootMargin: "200px", threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [paper, question, getPaperBlobForQuestion]);

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setSnippetWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const regions = useMemo(() => {
    if (question.pageRegions && question.pageRegions.length > 0) {
      return question.pageRegions.map((r) => ({
        page: r.page,
        x: r.x ?? 0,
        y: r.y ?? 0,
        width: r.width ?? 595,
        height: r.height ?? 150,
      }));
    }
    return [
      {
        page: question.pageRange?.[0] ?? 1,
        x: 0,
        y: 0,
        width: 595,
        height: 600,
      },
    ];
  }, [question.pageRegions, question.pageRange]);

  const tags = question.tags ?? [];
  const sourceLabel = (() => {
    const year = question.sourceYear;
    const level = question.sourceLevel ? formatLevelDisplay(question.sourceLevel) : null;
    const parts = [year, level].filter(Boolean);
    if (parts.length === 0) return null;
    return parts.join(" · ");
  })();

  return (
    <li
      ref={itemRef}
      className="practice-hub__prediction-question color-bg-grey-5 rounded-in"
    >
      <div className="practice-hub__prediction-question-header">
        <span className="practice-hub__prediction-question-index color-bg-accent color-txt-accent">
          Q{index + 1}
        </span>
        <span className="practice-hub__prediction-question-name txt-heading-colour truncate">
          {question.questionName || `Question ${index + 1}`}
        </span>
      </div>
      {tags.length > 0 && (
        <div className="practice-hub__prediction-question-tags">
          {tags.map((t) => (
            <span
              key={t}
              className="color-bg-accent color-txt-accent rounded-in px-1.5 py-0.5 text-xs"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {question.predictionReason && (
        <p className="practice-hub__prediction-question-reason color-txt-sub text-xs">
          {question.predictionReason}
        </p>
      )}
      <div
        ref={previewRef}
        className="practice-hub__prediction-question-preview rounded-in overflow-hidden"
      >
        {sourceBlob ? (
          <CroppedPdfRegions file={sourceBlob} regions={regions} pageWidth={snippetWidth} />
        ) : (
          <div className="practice-hub__prediction-question-skeleton color-bg-grey-10 animate-pulse" />
        )}
      </div>
      {sourceLabel && (
        <p className="practice-hub__prediction-question-source color-txt-sub text-xs">
          From {sourceLabel}
        </p>
      )}
    </li>
  );
}

/** One question in the prediction slide-in panel (image style). */
function PredictionImageQuestionItem({
  question,
  index,
}: {
  question: StoredImagePredictionQuestion;
  index: number;
}) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const itemRef = useRef<HTMLLIElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const el = itemRef.current;
    if (!el || loaded.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loaded.current = true;
        Promise.all(
          question.imageStoragePaths.map((path) =>
            getDownloadURL(storageRef(storage, path)).catch(() => null)
          )
        ).then((urls) => {
          setImageUrls(urls.filter((u): u is string => typeof u === "string"));
        });
      },
      { rootMargin: "200px", threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [question.imageStoragePaths]);

  const displayName = question.displayName.replace(/^\[Prediction\]\s*/, "");

  return (
    <li
      ref={itemRef}
      className="practice-hub__prediction-question color-bg-grey-5 rounded-in"
    >
      <div className="practice-hub__prediction-question-header">
        <span className="practice-hub__prediction-question-index color-bg-accent color-txt-accent">
          Q{index + 1}
        </span>
        <span className="practice-hub__prediction-question-name txt-heading-colour truncate">
          {displayName}
        </span>
      </div>
      {question.predictionReason && (
        <p className="practice-hub__prediction-question-reason color-txt-sub text-xs">
          {question.predictionReason}
        </p>
      )}
      <div className="practice-hub__prediction-question-preview rounded-in overflow-hidden">
        {imageUrls.length > 0 ? (
          <div className="practice-hub__prediction-question-images">
            {imageUrls.map((url, i) => (
              <img
                key={url}
                src={url}
                alt={`${displayName} – image ${i + 1}`}
                className="practice-hub__prediction-question-image"
              />
            ))}
          </div>
        ) : (
          <div className="practice-hub__prediction-question-skeleton color-bg-grey-10 animate-pulse" />
        )}
      </div>
      {question.sourceTopic && (
        <p className="practice-hub__prediction-question-source color-txt-sub text-xs">
          Topic: {question.sourceTopic.replace(/[-_]/g, " ")}
        </p>
      )}
    </li>
  );
}

/** Icon thumbnail for favourite subject cards on the landing page */
function SubjectIconImage({ subjectId }: { subjectId: string }) {
  if (subjectId === "irish") {
    return (
      <div className="image overflow-hidden flex items-center justify-center color-bg">
        <IrishHarpIcon size={48} className="color-txt-accent opacity-70" />
      </div>
    );
  }

  const Icon = getSubjectIcon(subjectId);
  return (
    <div className="image overflow-hidden flex items-center justify-center color-bg">
      <Icon size={48} className="color-txt-accent opacity-70" />
    </div>
  );
}

/** Single page image for full-paper preview */
function PaperPreviewPage({ blob, pageNumber }: { blob: Blob; pageNumber: number }) {
  const snapshot = usePaperSnapshot(blob, pageNumber);
  if (!snapshot) {
    return (
      <div className="practice-hub__preview-box color-bg-grey-5 rounded-in flex items-center justify-center color-txt-sub text-sm">
        Page {pageNumber}…
      </div>
    );
  }
  return (
    <div className="practice-hub__preview-box rounded-in overflow-hidden border border-[var(--color-grey)]/20">
      <img src={snapshot} alt={`Page ${pageNumber}`} className="practice-hub__preview-img" />
    </div>
  );
}

/** Scrollable full-paper preview (all pages) in panel */
function FullPaperPreview({ blob }: { blob: Blob | null }) {
  const numPages = usePaperPageCount(blob);
  if (!blob) {
    return (
      <div className="practice-hub__preview-box color-bg-grey-5 rounded-in flex items-center justify-center color-txt-sub text-sm">
        Loading…
      </div>
    );
  }
  if (numPages == null) {
    return (
      <div className="practice-hub__preview-box color-bg-grey-5 rounded-in flex items-center justify-center color-txt-sub text-sm">
        Loading…
      </div>
    );
  }
  return (
    <div className="practice-hub__preview-pages">
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <PaperPreviewPage key={pageNum} blob={blob} pageNumber={pageNum} />
      ))}
    </div>
  );
}
