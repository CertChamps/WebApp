import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LuArrowLeft,
  LuBookOpen,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuFileText,
  LuImage,
  LuLoaderCircle,
  LuSearch,
} from "react-icons/lu";
import { CollapsibleSidebar } from "../components/sidebar/CollapsibleSidebar";
import type { SidebarPanelId } from "../components/sidebar/SidebarTileManager";
import QuestionTitlePicker from "../components/questions/QuestionTitlePicker";
import { OptionsContext } from "../context/OptionsContext";
import { TimerProvider } from "../context/TimerContext";
import {
  getMarkingSchemeFilesForGroupedQuestion,
  useImageMarkingSchemesForTopic,
  useImageQuestionsForTopic,
  useImageSubjectAvailability,
  useImageTopics,
  useMarkingSchemeUrls,
  type GroupedImageQuestion,
  type MarkingSchemeFile,
} from "../hooks/useImageQuestions";
import {
  getStorageFolderName,
  PRACTICE_HUB_SUBJECTS,
  type SubjectOption,
} from "../data/practiceHubSubjects";
import "../styles/practiceBrowser.css";

const LEVEL_ORDER = ["higher", "ordinary", "foundation"];

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

  return (
    <div className="practice-browser__marking">
      <button
        type="button"
        className="practice-browser__marking-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={files.length === 0}
      >
        <span>{files.length > 0 ? "Marking scheme" : "No marking scheme available"}</span>
        {files.length > 0 && (
          <LuChevronDown
            size={18}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && (
        <div className="practice-browser__marking-images">
          {loading ? (
            <div className="flex items-center justify-center py-8 color-txt-sub">
              <LuLoaderCircle size={20} className="animate-spin" />
            </div>
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

function QuestionCard({
  question,
  index,
  markingSchemeFiles,
  active,
  register,
  onActivate,
}: {
  question: GroupedImageQuestion;
  index: number;
  markingSchemeFiles: MarkingSchemeFile[];
  active: boolean;
  register: (element: HTMLElement | null) => void;
  onActivate: () => void;
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
        <span className="practice-browser__image-count">
          <LuImage size={14} />
          {question.images.length}
        </span>
      </header>

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
  const storageSubject = subjectId ? getStorageFolderName(subjectId) : null;

  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanelId | null>("ai");
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const questionElements = useRef(new Map<string, HTMLElement>());
  const titleRowRef = useRef<HTMLDivElement>(null);

  const { subjects: availableSubjects, loading: subjectsLoading, error: subjectsError } =
    useImageSubjectAvailability();
  const { topics, levels, loading: topicsLoading, error: topicsError } = useImageTopics(
    storageSubject,
    selectedLevel
  );
  const { grouped: unsortedQuestions, loading: questionsLoading, error: questionsError } = useImageQuestionsForTopic(
    storageSubject,
    selectedLevel,
    selectedTopicName
  );
  const { files: markingSchemeFiles, loading: markingSchemesLoading } =
    useImageMarkingSchemesForTopic(storageSubject, selectedLevel, selectedTopicName);

  const subjectEntries = useMemo(() => {
    const availability = new Map(
      availableSubjects.map((subject) => [normalise(subject.storageName), subject.levels])
    );
    return PRACTICE_HUB_SUBJECTS.map((subject) => ({
      ...subject,
      levels: availability.get(normalise(getStorageFolderName(subject.id))) ?? [],
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

  const filteredTopics = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return topics;
    return topics.filter((topic) => topic.displayName.toLowerCase().includes(query));
  }, [search, topics]);

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
  }, [subjectId, selectedLevel, selectedTopicName]);

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
    (next: { subject?: string | null; level?: string | null; topic?: string | null }) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  const openLevel = (subject: string, level: string) => {
    setSearchParams({ subject, level });
  };

  const selectQuestion = (index: number) => {
    const question = grouped[index];
    if (!question) return;
    setActiveQuestionIndex(index);
    questionElements.current.get(question.key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showFeed = Boolean(storageSubject && selectedLevel && selectedTopicName);

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
                onClick={() => updateLocation({ topic: null })}
              >
                <LuArrowLeft size={17} />
                Topics
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
                <span>{selectedTopic?.displayName ?? "Questions"}</span>
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
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <div
          className={`practice-browser__sidebar ${options.leftHandMode ? "left-0" : "right-0"}`}
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
                    id: `practice_${storageSubject}_${selectedLevel}_${selectedTopicName}_${activeQuestion.key}`,
                    properties: { name: activeQuestion.displayName },
                    imageUrls: activeQuestion.images.map((image) => image.downloadUrl),
                  }
                : undefined
            }
            open={sidebarOpen}
            onOpenChange={setSidebarOpen}
            openPanel={sidebarPanel ?? undefined}
            onOpenPanelChange={(panel) => setSidebarPanel(panel ?? null)}
            forceShowMarkingSchemeTab
            markingSchemeImages={activeMarkingImages}
            markingSchemeLoading={markingSchemesLoading || activeMarkingLoading}
            markingSchemeQuestionName={activeQuestion?.displayName}
          />
        </div>
      </div>
    );
  }

  const viewingTopics = Boolean(storageSubject && selectedLevel);
  const pageTitle = viewingTopics
    ? `${levelLabel(selectedLevel ?? "")} Topics`
    : selectedSubject
      ? selectedSubject.label
      : "Practice Questions";
  const pageDescription = viewingTopics
    ? `Choose a topic to view all ${selectedSubject?.label ?? "subject"} questions in order.`
    : selectedSubject
      ? "Choose one of the available levels."
      : "Choose a subject and level to browse question images and marking schemes.";

  return (
    <div className="practice-browser h-full w-full overflow-y-auto overflow-x-hidden color-bg scrollbar-minimal">
      <div className="practice-browser__browse">
        <header className="practice-browser__hero">
          <div className="flex items-start gap-3">
            {selectedSubject && (
              <button
                type="button"
                className="practice-browser__back mt-1"
                onClick={() =>
                  viewingTopics
                    ? updateLocation({ level: null, topic: null })
                    : updateLocation({ subject: null, level: null, topic: null })
                }
                aria-label="Back"
              >
                <LuArrowLeft size={18} />
              </button>
            )}
            <div>
              <h1>{pageTitle}</h1>
              <p>{pageDescription}</p>
            </div>
          </div>
        </header>

        {!selectedSubject || viewingTopics ? (
          <label className="practice-browser__search">
            <LuSearch size={19} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={viewingTopics ? "Search topics…" : "Search subjects…"}
              aria-label={viewingTopics ? "Search topics" : "Search subjects"}
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
          <section>
            <h2 className="practice-browser__section-title">
              <LuBookOpen size={19} /> Subjects <span>({filteredSubjects.length})</span>
            </h2>
            <div className="practice-browser__card-grid">
              {filteredSubjects.map((subject) => (
                <article key={subject.id} className="practice-browser__subject-card">
                  <div className="practice-browser__card-title">
                    <h3>{subject.label}</h3>
                  </div>
                  <div className="practice-browser__levels">
                    {sortLevels(subject.levels).map((level) => (
                      <button key={level} type="button" onClick={() => openLevel(subject.id, level)}>
                        <span>{levelLabel(level)}</span>
                        <LuChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
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
        ) : topicsLoading ? (
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
                  onClick={() => updateLocation({ topic: topic.name })}
                >
                  <div className="practice-browser__topic-card-heading">
                    <span className="practice-browser__card-icon"><LuFileText size={19} /></span>
                    <h3>{topic.displayName}</h3>
                  </div>
                  <div className="practice-browser__topic-count">
                    <span>{topic.questionCount} questions</span>
                    <LuChevronRight size={17} />
                  </div>
                </button>
              ))}
            </div>
          </section>
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
