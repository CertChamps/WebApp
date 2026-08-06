import { useContext, useEffect, useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuBookOpen,
  LuCheck,
  LuChevronRight,
  LuFileText,
  LuImage,
  LuSearch,
  LuUpload,
} from "react-icons/lu";
import WhiteboardModal from "./WhiteboardModal";
import { UserContext } from "../../context/UserContext";
import {
  useExamPapers,
  formatLevelCode,
  type ExamPaper,
  type PaperQuestion,
} from "../../hooks/useExamPapers";
import {
  useImageTopics,
  useImagePapers,
  useImageQuestionsForPaper,
  listQuestionsForTopic,
  groupImageQuestions,
  listMarkingSchemeFilesForTopic,
  type ImageTopic,
  type ImagePaperGroup,
  type GroupedImageQuestion,
  type MarkingSchemeFile,
} from "../../hooks/useImageQuestions";
import { getStorageFolderName } from "../../data/practiceHubSubjects";
import { newAttachmentId, type AttachedQuestion } from "../../data/whiteboards";
import { uploadWhiteboardAsset } from "../../hooks/useWhiteboards";
import { buildImageAttachment, buildPaperAttachment } from "../../lib/whiteboardAttachments";

type Props = {
  /** UI subject slug (Practice Hub subject id). */
  subject: string;
  onAdd: (attachments: AttachedQuestion[]) => Promise<void> | void;
  onClose: () => void;
  /** Attach mode places question media on the open canvas instead of adding page questions. */
  mode?: "add" | "attach";
};

type Tab = "bank" | "upload";
type ImageBrowse = "topic" | "paper";

function topicStub(name: string): ImageTopic {
  const trimmed = name.trim() || "topic";
  return {
    name: trimmed,
    displayName: trimmed,
    path: trimmed,
    questionCount: 0,
    thumbnailUrl: null,
  };
}

function imageQuestionKey(
  storageFolder: string,
  level: string,
  scope: string,
  groupedKey: string
): string {
  return `image_${storageFolder}_${level}_${scope}_${groupedKey}`;
}

export default function AddQuestionModal({ subject, onAdd, onClose, mode = "add" }: Props) {
  const { user } = useContext(UserContext);
  const [tab, setTab] = useState<Tab>("bank");
  const [search, setSearch] = useState("");

  // ---- Bank: image catalogue (topics + papers) — preferred when available ----
  const [imageBrowse, setImageBrowse] = useState<ImageBrowse>("topic");
  const [imageLevel, setImageLevel] = useState<string | null>(null);
  const storageFolder = useMemo(() => getStorageFolderName(subject), [subject]);
  const {
    topics: imageTopics,
    levels: imageLevels,
    loading: topicsLoading,
  } = useImageTopics(storageFolder, imageLevel);
  const activeImageLevel =
    (imageLevel && imageLevels.includes(imageLevel) ? imageLevel : imageLevels[0]) ?? null;
  const hasImageBank = imageLevels.length > 0;

  // ---- Bank: legacy PDF past papers (only when no image catalogue) ----
  const { papers, loading: papersLoading, getPaperQuestions } = useExamPapers(
    topicsLoading || hasImageBank ? null : subject
  );
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [paperQuestions, setPaperQuestions] = useState<PaperQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  const isImageMode = hasImageBank || (!topicsLoading && !papersLoading && papers.length === 0);
  const bankLoading = topicsLoading || (!hasImageBank && papersLoading);

  const [selectedTopic, setSelectedTopic] = useState<ImageTopic | null>(null);
  const [selectedImagePaper, setSelectedImagePaper] = useState<ImagePaperGroup | null>(null);
  const [groupedQuestions, setGroupedQuestions] = useState<GroupedImageQuestion[]>([]);
  const [topicMsFiles, setTopicMsFiles] = useState<MarkingSchemeFile[]>([]);

  const {
    papers: imagePapers,
    loading: imagePapersLoading,
  } = useImagePapers(
    isImageMode && imageBrowse === "paper" ? storageFolder : null,
    isImageMode && imageBrowse === "paper" ? activeImageLevel : null
  );

  const {
    grouped: imagePaperGrouped,
    loading: imagePaperQuestionsLoading,
  } = useImageQuestionsForPaper(
    selectedImagePaper ? storageFolder : null,
    selectedImagePaper ? activeImageLevel : null,
    selectedImagePaper?.year ?? null,
    selectedImagePaper ? selectedImagePaper.paper : null,
    undefined,
    selectedImagePaper ? selectedImagePaper.paperType : undefined
  );

  // ---- Selection ----
  const [selection, setSelection] = useState<Map<string, AttachedQuestion>>(new Map());

  // ---- Upload tab ----
  const [uploadLabel, setUploadLabel] = useState("");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [markingFile, setMarkingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPaper) {
      setPaperQuestions([]);
      return;
    }
    let cancelled = false;
    setQuestionsLoading(true);
    getPaperQuestions(selectedPaper)
      .then((qs) => {
        if (!cancelled) setPaperQuestions(qs);
      })
      .catch(() => {
        if (!cancelled) setPaperQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPaper, getPaperQuestions]);

  useEffect(() => {
    if (!selectedTopic || !activeImageLevel) {
      setGroupedQuestions([]);
      setTopicMsFiles([]);
      return;
    }
    let cancelled = false;
    setQuestionsLoading(true);
    Promise.all([
      listQuestionsForTopic(storageFolder, activeImageLevel, selectedTopic.name),
      listMarkingSchemeFilesForTopic(storageFolder, activeImageLevel, selectedTopic.name).catch(
        () => [] as MarkingSchemeFile[]
      ),
    ])
      .then(([questions, msFiles]) => {
        if (cancelled) return;
        setGroupedQuestions(groupImageQuestions(questions));
        setTopicMsFiles(msFiles);
      })
      .catch(() => {
        if (!cancelled) {
          setGroupedQuestions([]);
          setTopicMsFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTopic, activeImageLevel, storageFolder]);

  const toggleSelection = (key: string, build: () => AttachedQuestion) => {
    setSelection((prev) => {
      if (mode === "attach") {
        return prev.has(key)
          ? new Map<string, AttachedQuestion>()
          : new Map<string, AttachedQuestion>([[key, build()]]);
      }
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, build());
      return next;
    });
  };

  const searchLower = search.trim().toLowerCase();
  const filteredPapers = useMemo(() => {
    if (!searchLower) return papers;
    return papers.filter((p) =>
      `${p.label} ${formatLevelCode(p.level)}`.toLowerCase().includes(searchLower)
    );
  }, [papers, searchLower]);
  const filteredPaperQuestions = useMemo(() => {
    if (!searchLower) return paperQuestions;
    return paperQuestions.filter((q) =>
      `${q.questionName} ${(q.tags ?? []).join(" ")}`.toLowerCase().includes(searchLower)
    );
  }, [paperQuestions, searchLower]);
  const filteredTopics = useMemo(() => {
    if (!searchLower) return imageTopics;
    return imageTopics.filter((t) => t.displayName.toLowerCase().includes(searchLower));
  }, [imageTopics, searchLower]);
  const filteredImagePapers = useMemo(() => {
    if (!searchLower) return imagePapers;
    return imagePapers.filter((p) =>
      `${p.label} ${p.topics.join(" ")}`.toLowerCase().includes(searchLower)
    );
  }, [imagePapers, searchLower]);
  const filteredGrouped = useMemo(() => {
    if (!searchLower) return groupedQuestions;
    return groupedQuestions.filter((g) => g.displayName.toLowerCase().includes(searchLower));
  }, [groupedQuestions, searchLower]);
  const filteredImagePaperGrouped = useMemo(() => {
    if (!searchLower) return imagePaperGrouped;
    return imagePaperGrouped.filter((g) =>
      `${g.displayName} ${g.topic ?? ""}`.toLowerCase().includes(searchLower)
    );
  }, [imagePaperGrouped, searchLower]);

  const visibleSelectable = useMemo(() => {
    if (selectedPaper) {
      return filteredPaperQuestions.map((question) => {
        const key = `paper_${selectedPaper.subject}_${selectedPaper.level}_${selectedPaper.id}_${question.id}`;
        return { key, build: () => buildPaperAttachment(selectedPaper, question) };
      });
    }
    if (selectedTopic && activeImageLevel) {
      return filteredGrouped.map((grouped) => {
        const key = imageQuestionKey(
          storageFolder,
          activeImageLevel,
          selectedTopic.name,
          grouped.key
        );
        return {
          key,
          build: () =>
            buildImageAttachment(
              storageFolder,
              activeImageLevel,
              selectedTopic,
              grouped,
              topicMsFiles
            ),
        };
      });
    }
    if (selectedImagePaper && activeImageLevel) {
      return filteredImagePaperGrouped.map((grouped) => {
        const scope = selectedImagePaper.key;
        const key = imageQuestionKey(storageFolder, activeImageLevel, scope, grouped.key);
        const topic = topicStub(grouped.topic || selectedImagePaper.topics[0] || "topic");
        return {
          key,
          build: () => buildImageAttachment(storageFolder, activeImageLevel, topic, grouped, []),
        };
      });
    }
    return [];
  }, [
    selectedPaper,
    filteredPaperQuestions,
    selectedTopic,
    activeImageLevel,
    filteredGrouped,
    storageFolder,
    topicMsFiles,
    selectedImagePaper,
    filteredImagePaperGrouped,
  ]);

  const allVisibleSelected =
    visibleSelectable.length > 0 && visibleSelectable.every((item) => selection.has(item.key));

  const toggleSelectAllVisible = () => {
    setSelection((prev) => {
      const next = new Map(prev);
      if (allVisibleSelected) {
        for (const item of visibleSelectable) next.delete(item.key);
      } else {
        for (const item of visibleSelectable) next.set(item.key, item.build());
      }
      return next;
    });
  };

  const handleAddSelection = async () => {
    if (selection.size === 0 || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onAdd(Array.from(selection.values()));
      onClose();
    } catch (error) {
      console.error("[AddQuestionModal] add failed:", error);
      setUploadError(
        mode === "attach"
          ? "That question couldn’t be attached. Please retry."
          : "Those questions couldn’t be added. Please retry."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!questionFile || !user?.uid || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const attachmentId = newAttachmentId();
      const questionAsset = await uploadWhiteboardAsset(user.uid, attachmentId, "question", questionFile);
      let markingAsset: { storagePath: string; fileType: "pdf" | "image" } | null = null;
      if (markingFile) {
        markingAsset = await uploadWhiteboardAsset(user.uid, attachmentId, "marking-scheme", markingFile);
      }
      const attachment: AttachedQuestion = {
        id: attachmentId,
        source: "custom",
        label: uploadLabel.trim() || questionFile.name.replace(/\.[^.]+$/, ""),
        custom: {
          questionPath: questionAsset.storagePath,
          questionType: questionAsset.fileType,
          markingSchemePath: markingAsset?.storagePath ?? null,
          markingSchemeType: markingAsset?.fileType ?? null,
        },
      };
      await onAdd([attachment]);
      onClose();
    } catch (err) {
      console.error("[AddQuestionModal] upload failed:", err);
      setUploadError("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  };

  const goBackToBankRoot = () => {
    setSelectedPaper(null);
    setSelectedTopic(null);
    setSelectedImagePaper(null);
    setSearch("");
  };

  const listRow =
    "flex w-full items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm color-txt-main color-bg-grey-5 hover:color-bg-grey-10 transition-colors cursor-pointer";

  const renderCheck = (checked: boolean) => (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded-md transition-colors ${
        checked ? "color-bg-accent color-txt-accent" : "color-bg-grey-10"
      }`}
      aria-hidden
    >
      {checked && <LuCheck size={13} strokeWidth={3} />}
    </span>
  );

  const viewingQuestionList = Boolean(selectedPaper || selectedTopic || selectedImagePaper);
  const questionListLoading = selectedPaper || selectedTopic
    ? questionsLoading
    : selectedImagePaper
      ? imagePaperQuestionsLoading
      : false;

  const searchPlaceholder = viewingQuestionList
    ? "Search questions…"
    : isImageMode
      ? imageBrowse === "paper"
        ? "Search papers…"
        : "Search topics…"
      : "Search papers…";

  const backLabel = selectedPaper
    ? selectedPaper.label
    : selectedTopic
      ? selectedTopic.displayName
      : selectedImagePaper?.label;

  return (
    <WhiteboardModal
      title={mode === "attach" ? "Attach CertChamps question" : "Add question"}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      footer={
        tab === "bank" ? (
          <div className="flex flex-col gap-2">
            {uploadError && <p className="text-sm color-txt-sub text-center">{uploadError}</p>}
            <button
              type="button"
              className="w-full py-2.5 rounded-xl text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-default"
              onClick={handleAddSelection}
              disabled={selection.size === 0 || uploading}
            >
              {uploading
                ? mode === "attach" ? "Attaching…" : "Adding…"
                : selection.size === 0
                  ? `Select questions to ${mode === "attach" ? "attach" : "add"}`
                  : `${mode === "attach" ? "Attach" : "Add"} ${selection.size} question${selection.size === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {uploadError && <p className="text-sm color-txt-sub text-center">{uploadError}</p>}
            <button
              type="button"
              className="w-full py-2.5 rounded-xl text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-default"
              onClick={handleUpload}
              disabled={!questionFile || uploading}
            >
              {uploading ? "Uploading…" : "Add question"}
            </button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {mode === "add" && <div className="flex gap-1 rounded-xl color-bg-grey-5 p-1">
          {(
            [
              { id: "bank", label: "Question bank", icon: LuFileText },
              { id: "upload", label: "Upload your own", icon: LuUpload },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                tab === id ? "color-bg color-txt-main" : "color-txt-sub hover:color-txt-main"
              }`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>}

        {tab === "bank" && (
          <>
            <div className="relative">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 color-txt-sub pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm color-bg-grey-5 color-txt-main placeholder:color-txt-sub outline-none"
                autoComplete="off"
              />
            </div>

            {viewingQuestionList && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                  onClick={goBackToBankRoot}
                >
                  <LuArrowLeft size={14} className="shrink-0" />
                  <span className="truncate">{backLabel}</span>
                </button>
                {mode === "add" && !questionListLoading && visibleSelectable.length > 0 && (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold color-txt-accent hover:color-bg-grey-5 transition-colors cursor-pointer"
                    onClick={toggleSelectAllVisible}
                  >
                    {allVisibleSelected ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5 min-h-[200px]">
              {bankLoading && (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                  ))}
                </>
              )}

              {/* PDF paper mode: paper list */}
              {!bankLoading && !isImageMode && !selectedPaper &&
                filteredPapers.map((paper) => (
                  <button
                    key={`${paper.subject}_${paper.level}_${paper.id}`}
                    type="button"
                    className={listRow}
                    onClick={() => {
                      setSelectedPaper(paper);
                      setSearch("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{paper.label}</span>
                    <span className="shrink-0 text-xs color-txt-sub">{formatLevelCode(paper.level)}</span>
                    <LuChevronRight size={16} className="shrink-0 color-txt-sub" />
                  </button>
                ))}

              {/* PDF paper mode: question list */}
              {!bankLoading && selectedPaper && (
                questionsLoading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                  ))
                ) : (
                  filteredPaperQuestions.map((question) => {
                    const key = `paper_${selectedPaper.subject}_${selectedPaper.level}_${selectedPaper.id}_${question.id}`;
                    const checked = selection.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={listRow}
                        onClick={() => toggleSelection(key, () => buildPaperAttachment(selectedPaper, question))}
                        aria-pressed={checked}
                      >
                        {renderCheck(checked)}
                        <span className="min-w-0 flex-1 truncate">{question.questionName}</span>
                        {question.tags && question.tags.length > 0 && (
                          <span className="shrink-0 max-w-[40%] truncate text-xs color-txt-sub">
                            {question.tags.join(", ")}
                          </span>
                        )}
                      </button>
                    );
                  })
                )
              )}

              {/* Image catalogue: level chips + browse toggle + lists */}
              {!bankLoading && isImageMode && !selectedTopic && !selectedImagePaper && (
                <>
                  {imageLevels.length > 1 && (
                    <div className="flex gap-1.5 pb-1">
                      {imageLevels.map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                            level === activeImageLevel
                              ? "color-bg-accent color-txt-accent"
                              : "color-bg-grey-5 color-txt-sub hover:color-bg-grey-10"
                          }`}
                          onClick={() => {
                            setImageLevel(level);
                            setSelectedTopic(null);
                            setSelectedImagePaper(null);
                          }}
                        >
                          {formatLevelCode(level)}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1 rounded-xl color-bg-grey-5 p-1 mb-0.5">
                    {(
                      [
                        { id: "topic" as const, label: "By topic" },
                        { id: "paper" as const, label: "By paper" },
                      ]
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`flex flex-1 items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                          imageBrowse === id ? "color-bg color-txt-main" : "color-txt-sub hover:color-txt-main"
                        }`}
                        onClick={() => {
                          setImageBrowse(id);
                          setSelectedTopic(null);
                          setSelectedImagePaper(null);
                          setSearch("");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {imageBrowse === "topic" && (
                    <>
                      {topicsLoading &&
                        [1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                        ))}
                      {!topicsLoading &&
                        filteredTopics.map((topic) => (
                          <button
                            key={topic.path}
                            type="button"
                            className={listRow}
                            onClick={() => {
                              setSelectedTopic(topic);
                              setSearch("");
                            }}
                          >
                            <LuImage size={16} className="shrink-0 color-txt-sub" />
                            <span className="min-w-0 flex-1 truncate font-semibold">{topic.displayName}</span>
                            {topic.questionCount > 0 && (
                              <span className="shrink-0 text-xs color-txt-sub">{topic.questionCount} questions</span>
                            )}
                            <LuChevronRight size={16} className="shrink-0 color-txt-sub" />
                          </button>
                        ))}
                      {!topicsLoading && filteredTopics.length === 0 && (
                        <p className="py-6 text-center text-sm color-txt-sub">
                          No questions available for this subject yet.
                        </p>
                      )}
                    </>
                  )}

                  {imageBrowse === "paper" && (
                    <>
                      {imagePapersLoading &&
                        [1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                        ))}
                      {!imagePapersLoading &&
                        filteredImagePapers.map((paper) => (
                          <button
                            key={paper.key}
                            type="button"
                            className={listRow}
                            onClick={() => {
                              setSelectedImagePaper(paper);
                              setSearch("");
                            }}
                          >
                            <LuBookOpen size={16} className="shrink-0 color-txt-sub" />
                            <span className="min-w-0 flex-1 truncate font-semibold">{paper.label}</span>
                            {(paper.paper === 1 || paper.paper === 2) && (
                              <span className="shrink-0 rounded-md color-bg-grey-10 px-1.5 py-0.5 text-[11px] font-semibold color-txt-sub">
                                P{paper.paper}
                              </span>
                            )}
                            <span className="shrink-0 text-xs color-txt-sub">
                              {paper.questionCount} questions
                            </span>
                            <LuChevronRight size={16} className="shrink-0 color-txt-sub" />
                          </button>
                        ))}
                      {!imagePapersLoading && filteredImagePapers.length === 0 && (
                        <p className="py-6 text-center text-sm color-txt-sub">
                          No papers match your search.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Image topic questions */}
              {!bankLoading && isImageMode && selectedTopic && (
                questionsLoading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                  ))
                ) : (
                  filteredGrouped.map((grouped) => {
                    const key = imageQuestionKey(
                      storageFolder,
                      activeImageLevel ?? "higher",
                      selectedTopic.name,
                      grouped.key
                    );
                    const checked = selection.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={listRow}
                        onClick={() =>
                          toggleSelection(key, () =>
                            buildImageAttachment(
                              storageFolder,
                              activeImageLevel ?? "higher",
                              selectedTopic,
                              grouped,
                              topicMsFiles
                            )
                          )
                        }
                        aria-pressed={checked}
                      >
                        {renderCheck(checked)}
                        <span className="min-w-0 flex-1 truncate">{grouped.displayName}</span>
                      </button>
                    );
                  })
                )
              )}

              {/* Image paper questions */}
              {!bankLoading && isImageMode && selectedImagePaper && (
                imagePaperQuestionsLoading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                  ))
                ) : filteredImagePaperGrouped.length === 0 ? (
                  <p className="py-6 text-center text-sm color-txt-sub">No questions in this paper.</p>
                ) : (
                  filteredImagePaperGrouped.map((grouped) => {
                    const key = imageQuestionKey(
                      storageFolder,
                      activeImageLevel ?? "higher",
                      selectedImagePaper.key,
                      grouped.key
                    );
                    const checked = selection.has(key);
                    const topic = topicStub(grouped.topic || selectedImagePaper.topics[0] || "topic");
                    return (
                      <button
                        key={key}
                        type="button"
                        className={listRow}
                        onClick={() =>
                          toggleSelection(key, () =>
                            buildImageAttachment(
                              storageFolder,
                              activeImageLevel ?? "higher",
                              topic,
                              grouped,
                              []
                            )
                          )
                        }
                        aria-pressed={checked}
                      >
                        {renderCheck(checked)}
                        <span className="min-w-0 flex-1 truncate">{grouped.displayName}</span>
                        {grouped.topic && (
                          <span className="shrink-0 max-w-[40%] truncate text-xs color-txt-sub">
                            {grouped.topic}
                          </span>
                        )}
                      </button>
                    );
                  })
                )
              )}

              {!bankLoading && !isImageMode && !selectedPaper && filteredPapers.length === 0 && (
                <p className="py-6 text-center text-sm color-txt-sub">No papers match your search.</p>
              )}
            </div>
          </>
        )}

        {tab === "upload" && (
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold color-txt-sub" htmlFor="wb-upload-label">
                Question name
              </label>
              <input
                id="wb-upload-label"
                type="text"
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder="e.g. Class test — vectors"
                className="w-full px-3 py-2 rounded-xl text-sm color-bg-grey-5 color-txt-main placeholder:color-txt-sub outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold color-txt-sub">Question (PDF or image)</span>
              <label className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-3 py-2.5 text-sm color-txt-main hover:color-bg-grey-10 transition-colors cursor-pointer">
                <LuUpload size={16} className="shrink-0 color-txt-sub" />
                <span className="min-w-0 flex-1 truncate">
                  {questionFile ? questionFile.name : "Choose a file…"}
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setQuestionFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold color-txt-sub">Marking scheme (optional)</span>
              <label className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-3 py-2.5 text-sm color-txt-main hover:color-bg-grey-10 transition-colors cursor-pointer">
                <LuUpload size={16} className="shrink-0 color-txt-sub" />
                <span className="min-w-0 flex-1 truncate">
                  {markingFile ? markingFile.name : "Choose a file…"}
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setMarkingFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </WhiteboardModal>
  );
}
