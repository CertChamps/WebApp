import { useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LuArrowLeft,
  LuBookOpen,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuFileText,
  LuLoaderCircle,
  LuPencil,
  LuSearch,
  LuStar,
} from "react-icons/lu";
import { CollapsibleSidebar } from "../components/sidebar/CollapsibleSidebar";
import type { SidebarPanelId } from "../components/sidebar/SidebarTileManager";
import { FloatingWidgets } from "../components/floating/FloatingWidgets";
import QuestionTitlePicker from "../components/questions/QuestionTitlePicker";
import QuestionAudioPlayer from "../components/questions/QuestionAudioPlayer";
import { OptionsContext } from "../context/OptionsContext";
import { TimerProvider } from "../context/TimerContext";
import {
  getMarkingSchemeFilesForGroupedQuestion,
  useImageMarkingSchemesForTopic,
  useImageQuestionsForTopic,
  useImageQuestionsForPaper,
  useImageSubjectAvailability,
  useImageTopics,
  useImagePapers,
  useMarkingSchemeUrls,
  type GroupedImageQuestion,
  type MarkingSchemeFile,
  type ImagePaperGroup,
} from "../hooks/useImageQuestions";
import {
  getStorageFolderName,
  getFavouriteSubjectIds,
  FAVOURITES_CHANGED_EVENT,
  PRACTICE_HUB_SUBJECTS,
  toggleFavourite,
  useSyncedFavouriteSubjectIds,
  type SubjectOption,
} from "../data/practiceHubSubjects";
import { parseExamCycle, type ExamCycleId, EXAM_CYCLES } from "../lib/examCycle";
import SaveQuestionToCanvasModal from "../components/whiteboards/SaveQuestionToCanvasModal";
import { buildImageAttachment } from "../lib/whiteboardAttachments";
import type { AttachedQuestion } from "../data/whiteboards";
import "../styles/practiceBrowser.css";

const LEVEL_ORDER = ["higher", "ordinary", "foundation"];
const EXAM_CYCLE_IDS = Object.keys(EXAM_CYCLES) as ExamCycleId[];

type SubjectEntry = SubjectOption & { levels: string[] };
type BrowseMode = "topic" | "paper";

function normalise(value: string): string {
  return value.replace(/[-_\s]/g, "").toLowerCase();
}

function levelLabel(level: string): string {
  const value = level.toLowerCase();
  if (value === "higher") return "Higher";
  if (value === "ordinary") return "Ordinary";
  if (value === "foundation") return "Foundation";
  return level.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sortLevels(levels: string[]): string[] {
  return [...levels].sort((a, b) => {
    const ai = LEVEL_ORDER.indexOf(a.toLowerCase());
    const bi = LEVEL_ORDER.indexOf(b.toLowerCase());
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function questionYear(question: GroupedImageQuestion): number {
  const match = question.key.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return match?.[1] ? Number(match[1]) : 0;
}

function InlineMarkingScheme({ files }: { files: MarkingSchemeFile[] }) {
  const [open, setOpen] = useState(false);
  const { images, loading } = useMarkingSchemeUrls(open ? files : []);
  const hasFiles = files.length > 0;

  return (
    <div className="practice-browser__marking">
      <button
        type="button"
        className="practice-browser__marking-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasFiles}
      >
        <span>{hasFiles ? "Marking scheme" : "No marking scheme available"}</span>
        {hasFiles && (
          <LuChevronDown
            size={18}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && hasFiles && (
        <div className="practice-browser__marking-images">
          {loading ? (
            <div className="flex items-center justify-center py-8 color-txt-sub">
              <LuLoaderCircle size={20} className="animate-spin" />
            </div>
          ) : images.length === 0 ? (
            <p className="py-6 text-center text-sm color-txt-sub">
              Marking scheme couldn’t be loaded for this question.
            </p>
          ) : (
            images.map((image) => (
              <img
                key={image.storagePath}
                src={image.downloadUrl}
                alt={image.displayName}
                loading="lazy"
                className="practice-browser__question-image"
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SubjectCard({
  subject,
  favourite,
  onToggleFavourite,
  onOpenLevel,
}: {
  subject: SubjectEntry;
  favourite: boolean;
  onToggleFavourite: () => void;
  onOpenLevel: (level: string) => void;
}) {
  return (
    <article className={`practice-browser__subject-card ${favourite ? "practice-browser__subject-card--favourite" : ""}`}>
      <div className="practice-browser__card-title">
        <h3>{subject.label}</h3>
        <button
          type="button"
          className={`practice-browser__favourite-button ${favourite ? "practice-browser__favourite-button--active" : ""}`}
          onClick={onToggleFavourite}
          aria-label={favourite ? `Remove ${subject.label} from favourites` : `Add ${subject.label} to favourites`}
          aria-pressed={favourite}
          title={favourite ? "Remove from favourites" : "Add to favourites"}
        >
          <LuStar size={19} fill={favourite ? "currentColor" : "none"} strokeWidth={2} />
        </button>
      </div>
      <div className="practice-browser__levels">
        {sortLevels(subject.levels).map((level) => (
          <button key={level} type="button" onClick={() => onOpenLevel(level)}>
            <span>{levelLabel(level)}</span>
            <LuChevronRight size={16} />
          </button>
        ))}
      </div>
    </article>
  );
}

function QuestionCard({
  question,
  index,
  markingSchemeFiles,
  active,
  register,
  onActivate,
  onAddToCanvas,
}: {
  question: GroupedImageQuestion;
  index: number;
  markingSchemeFiles: MarkingSchemeFile[];
  active: boolean;
  register: (element: HTMLElement | null) => void;
  onActivate: () => void;
  onAddToCanvas: () => void;
}) {
  const files = useMemo(
    () => getMarkingSchemeFilesForGroupedQuestion(markingSchemeFiles, question),
    [markingSchemeFiles, question]
  );

  return (
    <article
      ref={register}
      data-question-key={question.key}
      className={`practice-browser__question-card ${active ? "practice-browser__question-card--active" : ""}`}
      onClick={onActivate}
    >
      <header className="practice-browser__question-header">
        <div>
          <p className="practice-browser__eyebrow">Question {index + 1}</p>
          <h2 className="text-base font-bold color-txt-main">{question.displayName}</h2>
        </div>
        <div className="practice-browser__question-actions">
          <button
            type="button"
            className="practice-browser__canvas-button"
            onClick={(event) => {
              event.stopPropagation();
              onAddToCanvas();
            }}
            aria-label={`Add ${question.displayName} to whiteboard`}
            title="Add to whiteboard"
          >
            <LuPencil size={18} strokeWidth={2.4} />
            <span>Add to whiteboard</span>
          </button>
        </div>
      </header>

      {question.audioPath && active && (
        <div className="mb-3" onClick={(event) => event.stopPropagation()}>
          <QuestionAudioPlayer
            audioPath={question.audioPath}
            startSec={question.audioStartSec}
            startLabel={question.audioStartLabel}
            autoLoad={false}
          />
        </div>
      )}

      <div className="practice-browser__question-images">
        {question.images.map((image) => (
          <img
            key={image.storagePath}
            src={image.downloadUrl}
            alt={image.displayName}
            loading="lazy"
            className="practice-browser__question-image"
          />
        ))}
      </div>

      <InlineMarkingScheme files={files} />
    </article>
  );
}

function PracticeBrowserInner() {
  const { options } = useContext(OptionsContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectId = searchParams.get("subject");
  const selectedLevel = searchParams.get("level");
  const selectedTopicName = searchParams.get("topic");
  const browseMode = (searchParams.get("browse") === "topic" ? "topic" : "paper") as BrowseMode;
  const paperYearParam = searchParams.get("year");
  const paperNumParam = searchParams.get("paper");
  const targetQuestionKey = searchParams.get("question");
  const selectedPaperYear = paperYearParam ? Number(paperYearParam) : null;
  const selectedPaperNum =
    paperNumParam === "1" || paperNumParam === "2" ? Number(paperNumParam) : null;
  const cycle: ExamCycleId = parseExamCycle(searchParams.get("cycle"));
  const storageSubject = subjectId ? getStorageFolderName(subjectId) : null;

  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanelId | null>("ai");
  const [canvasAttachment, setCanvasAttachment] = useState<AttachedQuestion | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [favouriteSubjectIds, setFavouriteSubjectIds] = useState<string[]>(
    () => getFavouriteSubjectIds()
  );
  const syncedFavouriteSubjectIds = useSyncedFavouriteSubjectIds();
  const scrollRef = useRef<HTMLDivElement>(null);
  const questionElements = useRef(new Map<string, HTMLElement>());
  const titleRowRef = useRef<HTMLDivElement>(null);

  const { subjects: availableSubjects, loading: subjectsLoading, error: subjectsError } =
    useImageSubjectAvailability(cycle);
  const { topics, levels, loading: topicsLoading, error: topicsError } = useImageTopics(
    storageSubject,
    selectedLevel,
    cycle
  );
  const {
    papers: paperGroups,
    loading: papersLoading,
    error: papersError,
  } = useImagePapers(
    browseMode === "paper" ? storageSubject : null,
    browseMode === "paper" ? selectedLevel : null,
    cycle
  );

  const inPaperFeed =
    browseMode === "paper" &&
    selectedPaperYear != null &&
    Number.isFinite(selectedPaperYear);
  const inTopicFeed = browseMode === "topic" && Boolean(selectedTopicName);

  const {
    grouped: topicGrouped,
    loading: topicQuestionsLoading,
    error: topicQuestionsError,
  } = useImageQuestionsForTopic(
    inTopicFeed ? storageSubject : null,
    inTopicFeed ? selectedLevel : null,
    inTopicFeed ? selectedTopicName : null,
    cycle
  );

  const selectedPaperGroup: ImagePaperGroup | null = useMemo(() => {
    if (!inPaperFeed || selectedPaperYear == null) return null;
    return (
      paperGroups.find(
        (p) =>
          p.year === selectedPaperYear &&
          (selectedPaperNum == null ? p.paper == null : p.paper === selectedPaperNum)
      ) ?? null
    );
  }, [inPaperFeed, paperGroups, selectedPaperYear, selectedPaperNum]);

  const {
    grouped: paperGrouped,
    loading: paperQuestionsLoading,
    error: paperQuestionsError,
  } = useImageQuestionsForPaper(
    inPaperFeed ? storageSubject : null,
    inPaperFeed ? selectedLevel : null,
    inPaperFeed ? selectedPaperYear : null,
    inPaperFeed ? selectedPaperNum : null,
    cycle,
    selectedPaperGroup ? selectedPaperGroup.paperType : undefined
  );

  const unsortedQuestions = inPaperFeed ? paperGrouped : topicGrouped;
  const questionsLoading = inPaperFeed ? paperQuestionsLoading : topicQuestionsLoading;
  const questionsError = inPaperFeed ? paperQuestionsError : topicQuestionsError;

  const markingTopic =
    inTopicFeed
      ? selectedTopicName
      : inPaperFeed && paperGrouped[0]?.topic
        ? paperGrouped[0].topic
        : null;
  const { files: markingSchemeFiles, loading: markingSchemesLoading } =
    useImageMarkingSchemesForTopic(
      storageSubject,
      selectedLevel,
      markingTopic,
      cycle
    );

  const subjectEntries = useMemo(() => {
    const availability = new Map(
      availableSubjects.map((subject) => [normalise(subject.storageName), subject.levels])
    );
    const resolveLevels = (subject: SubjectOption): string[] => {
      const candidates = [
        getStorageFolderName(subject.id),
        subject.id,
        subject.label,
      ].map(normalise);
      for (const key of candidates) {
        const hit = availability.get(key);
        if (hit?.length) return hit;
      }
      // fuzzy: maths ↔ mathematics
      for (const [key, levels] of availability) {
        if (candidates.some((c) => key.includes(c) || c.includes(key))) return levels;
      }
      return [];
    };
    return PRACTICE_HUB_SUBJECTS.map((subject) => ({
      ...subject,
      levels: resolveLevels(subject),
    })).filter((subject) => subject.levels.length > 0);
  }, [availableSubjects]);

  const selectedSubject = useMemo<SubjectOption | null>(
    () => PRACTICE_HUB_SUBJECTS.find((subject) => subject.id === subjectId) ?? null,
    [subjectId]
  );
  const selectedTopic = topics.find((topic) => topic.name === selectedTopicName) ?? null;

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return subjectEntries;
    return subjectEntries.filter((subject) => subject.label.toLowerCase().includes(query));
  }, [search, subjectEntries]);
  const favouriteSubjects = useMemo(
    () => filteredSubjects.filter((subject) => favouriteSubjectIds.includes(subject.id)),
    [filteredSubjects, favouriteSubjectIds]
  );
  const otherSubjects = useMemo(
    () => filteredSubjects.filter((subject) => !favouriteSubjectIds.includes(subject.id)),
    [filteredSubjects, favouriteSubjectIds]
  );

  useEffect(() => {
    const syncFavourites = () => setFavouriteSubjectIds(getFavouriteSubjectIds());
    window.addEventListener(FAVOURITES_CHANGED_EVENT, syncFavourites);
    return () => window.removeEventListener(FAVOURITES_CHANGED_EVENT, syncFavourites);
  }, []);

  useEffect(() => {
    setFavouriteSubjectIds(syncedFavouriteSubjectIds);
  }, [syncedFavouriteSubjectIds]);

  const handleToggleFavourite = useCallback((subject: string) => {
    setFavouriteSubjectIds((current) => toggleFavourite(subject, current));
  }, []);

  const filteredTopics = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return topics;
    return topics.filter((topic) => topic.displayName.toLowerCase().includes(query));
  }, [search, topics]);

  const filteredPapers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return paperGroups;
    return paperGroups.filter((p) => p.label.toLowerCase().includes(query));
  }, [search, paperGroups]);

  const grouped = useMemo(
    () =>
      [...unsortedQuestions].sort(
        (a, b) =>
          questionYear(b) - questionYear(a) ||
          a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" })
      ),
    [unsortedQuestions]
  );

  const activeQuestion = grouped[activeQuestionIndex] ?? grouped[0];
  const activeMarkingFiles = useMemo(
    () =>
      activeQuestion
        ? getMarkingSchemeFilesForGroupedQuestion(markingSchemeFiles, activeQuestion)
        : [],
    [activeQuestion, markingSchemeFiles]
  );
  const { images: activeMarkingImages, loading: activeMarkingLoading } =
    useMarkingSchemeUrls(activeMarkingFiles);

  useEffect(() => {
    setSearch("");
    setActiveQuestionIndex(0);
    questionElements.current.clear();
  }, [subjectId, selectedLevel, selectedTopicName, selectedPaperYear, selectedPaperNum, browseMode, cycle]);

  useEffect(() => {
    if (!targetQuestionKey || grouped.length === 0) return;
    const index = grouped.findIndex((question) => question.key === targetQuestionKey);
    if (index < 0) return;
    setActiveQuestionIndex(index);
    questionElements.current.get(targetQuestionKey)?.scrollIntoView({ block: "start" });
  }, [grouped, targetQuestionKey]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || grouped.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const key = (visible?.target as HTMLElement | undefined)?.dataset.questionKey;
        if (!key) return;
        const index = grouped.findIndex((question) => question.key === key);
        if (index >= 0) setActiveQuestionIndex(index);
      },
      { root, rootMargin: "-15% 0px -55% 0px", threshold: [0, 0.2, 0.5] }
    );
    questionElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [grouped]);

  const updateLocation = useCallback(
    (next: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(next)) {
        if (value != null && value !== "") params.set(key, value);
        else params.delete(key);
      }
      if (!params.get("cycle")) params.set("cycle", cycle);
      setSearchParams(params);
    },
    [searchParams, setSearchParams, cycle]
  );

  const openLevel = (subject: string, level: string) => {
    setSearchParams({ subject, level, cycle, browse: browseMode });
  };

  const setBrowseMode = (mode: BrowseMode) => {
    updateLocation({
      browse: mode,
      topic: null,
      year: null,
      paper: null,
    });
  };

  const selectQuestion = (index: number) => {
    const question = grouped[index];
    if (!question) return;
    setActiveQuestionIndex(index);
    questionElements.current.get(question.key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showFeed = inTopicFeed || inPaperFeed;

  if (showFeed) {
    return (
      <div className="practice-browser relative flex h-full min-h-0 w-full overflow-hidden color-bg">
        <main
          ref={scrollRef}
          className={`practice-browser__feed scrollbar-minimal ${
            sidebarOpen
              ? options.leftHandMode
                ? "practice-browser__feed--sidebar-left"
                : "practice-browser__feed--sidebar-right"
              : ""
          }`}
        >
          <div className="practice-browser__feed-inner">
            <div className="practice-browser__feed-toolbar">
              <button
                type="button"
                className="practice-browser__back"
                onClick={() =>
                  updateLocation({
                    topic: null,
                    year: null,
                    paper: null,
                  })
                }
              >
                <LuArrowLeft size={17} />
                {browseMode === "paper" ? "Papers" : "Topics"}
              </button>

              {grouped.length > 0 && (
                <div ref={titleRowRef} className="practice-browser__question-picker">
                  <button
                    type="button"
                    className="practice-browser__picker-arrow"
                    onClick={() => selectQuestion(Math.max(0, activeQuestionIndex - 1))}
                    disabled={activeQuestionIndex === 0}
                    aria-label="Previous question"
                  >
                    <LuChevronLeft size={17} />
                  </button>
                  <QuestionTitlePicker
                    anchorRef={titleRowRef}
                    title={activeQuestion?.displayName ?? "Questions"}
                    titleKey={activeQuestion?.key}
                    tagsDisplay={`${activeQuestionIndex + 1} / ${grouped.length}`}
                    items={grouped.map((question) => ({ id: question.key, label: question.displayName }))}
                    currentIndex={activeQuestionIndex}
                    onSelect={selectQuestion}
                  />
                  <button
                    type="button"
                    className="practice-browser__picker-arrow"
                    onClick={() => selectQuestion(Math.min(grouped.length - 1, activeQuestionIndex + 1))}
                    disabled={activeQuestionIndex >= grouped.length - 1}
                    aria-label="Next question"
                  >
                    <LuChevronRight size={17} />
                  </button>
                </div>
              )}

              <div className="practice-browser__topic-label">
                <span>
                  {inPaperFeed
                    ? selectedPaperGroup?.label ??
                      (selectedPaperNum
                        ? `${selectedPaperYear} Paper ${selectedPaperNum}`
                        : String(selectedPaperYear))
                    : selectedTopic?.displayName ?? "Questions"}
                </span>
                <small>{levelLabel(selectedLevel ?? "")}</small>
              </div>
            </div>

            {questionsLoading ? (
              <div className="practice-browser__status">
                <LuLoaderCircle size={24} className="animate-spin" />
                Loading questions…
              </div>
            ) : questionsError ? (
              <div className="practice-browser__status">Couldn’t load these questions. Please try again.</div>
            ) : grouped.length === 0 ? (
              <div className="practice-browser__status">No question images are available for this topic yet.</div>
            ) : (
              <div className="practice-browser__questions">
                {grouped.map((question, index) => (
                  <QuestionCard
                    key={question.key}
                    question={question}
                    index={index}
                    markingSchemeFiles={markingSchemeFiles}
                    active={index === activeQuestionIndex}
                    register={(element) => {
                      if (element) questionElements.current.set(question.key, element);
                      else questionElements.current.delete(question.key);
                    }}
                    onActivate={() => setActiveQuestionIndex(index)}
                    onAddToCanvas={() => {
                      if (!storageSubject || !selectedLevel) return;
                      const topicForAttach =
                        selectedTopic ??
                        (question.topic
                          ? {
                              name: question.topic,
                              displayName: question.topic,
                              path: question.topic,
                              questionCount: 0,
                              thumbnailUrl: null,
                            }
                          : null);
                      if (!topicForAttach) return;
                      setActiveQuestionIndex(index);
                      setCanvasAttachment(
                        buildImageAttachment(
                          storageSubject,
                          selectedLevel,
                          topicForAttach,
                          question,
                          markingSchemeFiles
                        )
                      );
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <div
          className={`ai-session-sidebar practice-browser__sidebar ${options.leftHandMode ? "left-0" : "right-0"}`}
          style={{
            clipPath: sidebarOpen
              ? "inset(0 0 0 0)"
              : options.leftHandMode
                ? "inset(0 calc(100% - 3rem) 0 0)"
                : "inset(0 0 0 calc(100% - 3rem))",
          }}
        >
          <CollapsibleSidebar
            className="pointer-events-auto"
            side={options.leftHandMode ? "left" : "right"}
            question={
              activeQuestion
                ? {
                    id: `image_${storageSubject}_${selectedLevel}_${activeQuestion.topic ?? selectedTopicName ?? "paper"}_${activeQuestion.key}`,
                    properties: { name: activeQuestion.displayName },
                    imageUrls: activeQuestion.images.map((image) => image.downloadUrl),
                    markingSchemeImageUrls: activeMarkingImages.map((image) => image.downloadUrl),
                    _discoverId: `image_${storageSubject}_${selectedLevel}_${activeQuestion.topic ?? selectedTopicName ?? "paper"}_${activeQuestion.key}`,
                    _discoverName: activeQuestion.displayName,
                    _discoverSubjectId: subjectId,
                    _discoverSubjectLabel: selectedSubject?.label,
                    _discoverLevel: selectedLevel,
                    _discoverTopic: activeQuestion.topic ?? selectedTopicName,
                    _discoverSource: "practice",
                    _practiceUrl: `/practice?${new URLSearchParams({
                      subject: subjectId ?? "",
                      level: selectedLevel ?? "",
                      browse: browseMode,
                      ...(selectedTopicName ? { topic: selectedTopicName } : {}),
                      ...(selectedPaperYear != null ? { year: String(selectedPaperYear) } : {}),
                      ...(selectedPaperNum != null ? { paper: String(selectedPaperNum) } : {}),
                      question: activeQuestion.key,
                      cycle,
                    }).toString()}`,
                  }
                : undefined
            }
            open={sidebarOpen}
            onOpenChange={setSidebarOpen}
            openPanel={sidebarPanel ?? undefined}
            onOpenPanelChange={(panel) => setSidebarPanel(panel ?? null)}
            forceShowMarkingSchemeTab
            markingSchemeImages={activeMarkingImages}
            markingSchemeLoading={
              (activeMarkingFiles.length === 0 && markingSchemesLoading) || activeMarkingLoading
            }
            markingSchemeQuestionName={activeQuestion?.displayName}
          />
        </div>

        <FloatingWidgets
          leftHandMode={options.leftHandMode}
          spotifyTabVisible={sidebarOpen && sidebarPanel === "spotify"}
          onOpenTimer={() => {
            setSidebarOpen(true);
            setSidebarPanel("timer");
          }}
          onOpenSpotify={() => {
            setSidebarOpen(true);
            setSidebarPanel("spotify");
          }}
        />

        {canvasAttachment && subjectId && (
          <SaveQuestionToCanvasModal
            subject={subjectId}
            attachment={canvasAttachment}
            onClose={() => setCanvasAttachment(null)}
          />
        )}
      </div>
    );
  }

  const viewingBrowse = Boolean(storageSubject && selectedLevel);
  const pageTitle = viewingBrowse
    ? `${levelLabel(selectedLevel ?? "")} · ${browseMode === "paper" ? "By paper" : "By topic"}`
    : selectedSubject
      ? selectedSubject.label
      : "Practice Questions";
  const pageDescription = viewingBrowse
    ? browseMode === "paper"
      ? `Browse ${selectedSubject?.label ?? "subject"} by exam paper.`
      : `Browse ${selectedSubject?.label ?? "subject"} by topic.`
    : selectedSubject
      ? "Choose one of the available levels."
      : "Choose a subject and level to browse question images.";

  return (
    <div className="practice-browser h-full w-full overflow-y-auto overflow-x-hidden color-bg scrollbar-minimal">
      <div className="practice-browser__browse">
        <header className="practice-browser__hero">
          {selectedSubject && (
            <nav className="practice-browser__breadcrumbs" aria-label="Breadcrumb">
              <button
                type="button"
                className="practice-browser__breadcrumb"
                onClick={() =>
                  updateLocation({
                    subject: null,
                    level: null,
                    topic: null,
                    year: null,
                    paper: null,
                  })
                }
              >
                Practice Questions
              </button>
              <LuChevronRight size={14} strokeWidth={2.5} className="practice-browser__breadcrumb-sep" aria-hidden />
              {viewingBrowse ? (
                <>
                  <button
                    type="button"
                    className="practice-browser__breadcrumb truncate"
                    onClick={() =>
                      updateLocation({ level: null, topic: null, year: null, paper: null })
                    }
                  >
                    {selectedSubject.label}
                  </button>
                  <LuChevronRight size={14} strokeWidth={2.5} className="practice-browser__breadcrumb-sep" aria-hidden />
                  <span className="practice-browser__breadcrumb practice-browser__breadcrumb--current truncate">
                    {levelLabel(selectedLevel ?? "")}
                  </span>
                </>
              ) : (
                <span className="practice-browser__breadcrumb practice-browser__breadcrumb--current truncate">
                  {selectedSubject.label}
                </span>
              )}
            </nav>
          )}
          <h1>{pageTitle}</h1>
          <p>{pageDescription}</p>

          {!selectedSubject && (
            <div
              className="practice-browser__cycle-toggle"
              role="group"
              aria-label="Exam cycle"
              style={
                {
                  "--pb-toggle-count": EXAM_CYCLE_IDS.length,
                  "--pb-toggle-index": Math.max(0, EXAM_CYCLE_IDS.indexOf(cycle)),
                } as CSSProperties
              }
            >
              <span className="practice-browser__toggle-thumb" aria-hidden />
              {EXAM_CYCLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cycle === id ? "is-active" : ""}
                  onClick={() => setSearchParams({ cycle: id })}
                >
                  {EXAM_CYCLES[id].label}
                </button>
              ))}
            </div>
          )}
        </header>

        {!selectedSubject || viewingBrowse ? (
          <label className="practice-browser__search">
            <LuSearch size={19} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                viewingBrowse
                  ? browseMode === "paper"
                    ? "Search papers…"
                    : "Search topics…"
                  : "Search subjects…"
              }
              aria-label={
                viewingBrowse
                  ? browseMode === "paper"
                    ? "Search papers"
                    : "Search topics"
                  : "Search subjects"
              }
            />
          </label>
        ) : null}

        {subjectsLoading && !selectedSubject ? (
          <div className="practice-browser__status">
            <LuLoaderCircle size={24} className="animate-spin" />
            Loading subjects…
          </div>
        ) : subjectsError && !selectedSubject ? (
          <div className="practice-browser__status">Couldn’t load the available subjects.</div>
        ) : !selectedSubject ? (
          <div className="flex flex-col gap-8">
            {favouriteSubjects.length > 0 && (
              <section>
                <h2 className="practice-browser__section-title practice-browser__section-title--favourites">
                  <LuStar size={19} fill="currentColor" /> Favourites{" "}
                  <span>({favouriteSubjects.length})</span>
                </h2>
                <div className="practice-browser__card-grid">
                  {favouriteSubjects.map((subject) => (
                    <SubjectCard
                      key={subject.id}
                      subject={subject}
                      favourite
                      onToggleFavourite={() => handleToggleFavourite(subject.id)}
                      onOpenLevel={(level) => openLevel(subject.id, level)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="practice-browser__section-title">
                <LuBookOpen size={19} /> Subjects <span>({otherSubjects.length})</span>
              </h2>
              <div className="practice-browser__card-grid">
                {otherSubjects.map((subject) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    favourite={false}
                    onToggleFavourite={() => handleToggleFavourite(subject.id)}
                    onOpenLevel={(level) => openLevel(subject.id, level)}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : !selectedLevel ? (
          <section>
            <h2 className="practice-browser__section-title">Available levels</h2>
            <div className="practice-browser__level-grid">
              {sortLevels(
                subjectEntries.find((subject) => subject.id === selectedSubject.id)?.levels ?? levels
              ).map((level) => (
                <button key={level} type="button" onClick={() => openLevel(selectedSubject.id, level)}>
                  <span>{levelLabel(level)}</span>
                  <LuChevronRight size={18} />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <div
              className="practice-browser__browse-toggle"
              role="group"
              aria-label="Browse by"
              style={
                {
                  "--pb-toggle-count": 2,
                  "--pb-toggle-index": browseMode === "topic" ? 1 : 0,
                } as CSSProperties
              }
            >
              <span className="practice-browser__toggle-thumb" aria-hidden />
              <button
                type="button"
                className={browseMode === "paper" ? "is-active" : ""}
                onClick={() => setBrowseMode("paper")}
              >
                By paper
              </button>
              <button
                type="button"
                className={browseMode === "topic" ? "is-active" : ""}
                onClick={() => setBrowseMode("topic")}
              >
                By topic
              </button>
            </div>

            {browseMode === "topic" ? (
              topicsLoading ? (
                <div className="practice-browser__status">
                  <LuLoaderCircle size={24} className="animate-spin" />
                  Loading topics…
                </div>
              ) : topicsError ? (
                <div className="practice-browser__status">Couldn’t load the topics for this level.</div>
              ) : (
                <section>
                  <h2 className="practice-browser__section-title">
                    Topics <span>({filteredTopics.length})</span>
                  </h2>
                  <div className="practice-browser__card-grid">
                    {filteredTopics.map((topic) => (
                      <button
                        key={topic.name}
                        type="button"
                        className="practice-browser__topic-card"
                        onClick={() => updateLocation({ topic: topic.name, year: null, paper: null })}
                      >
                        <div className="practice-browser__topic-card-heading">
                          <span className="practice-browser__card-icon"><LuFileText size={19} /></span>
                          <h3>{topic.displayName}</h3>
                        </div>
                        <div className="practice-browser__topic-count">
                          <span>
                            {topic.questionCount > 0
                              ? `${topic.questionCount} questions`
                              : "Open topic"}
                          </span>
                          <LuChevronRight size={17} />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )
            ) : papersLoading ? (
              <div className="practice-browser__status">
                <LuLoaderCircle size={24} className="animate-spin" />
                Loading papers…
              </div>
            ) : papersError ? (
              <div className="practice-browser__status">Couldn’t load the papers for this level.</div>
            ) : (
              <section>
                <h2 className="practice-browser__section-title">
                  Papers <span>({filteredPapers.length})</span>
                </h2>
                <div className="practice-browser__card-grid">
                  {filteredPapers.map((paper) => (
                    <button
                      key={paper.key}
                      type="button"
                      className="practice-browser__topic-card"
                      onClick={() =>
                        updateLocation({
                          topic: null,
                          year: String(paper.year),
                          paper: paper.paper != null ? String(paper.paper) : null,
                        })
                      }
                    >
                      <div className="practice-browser__topic-card-heading">
                        <span className="practice-browser__card-icon"><LuBookOpen size={19} /></span>
                        <h3>{paper.label}</h3>
                      </div>
                      <div className="practice-browser__topic-count">
                        <span>
                          {paper.questionCount} questions · {paper.topics.length} topics
                        </span>
                        <LuChevronRight size={17} />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PracticeBrowser() {
  return (
    <TimerProvider>
      <PracticeBrowserInner />
    </TimerProvider>
  );
}
