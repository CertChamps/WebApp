import { useContext, useEffect, useMemo, useState } from "react";
import {
  LuArrowLeft,
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
  listQuestionsForTopic,
  groupImageQuestions,
  listMarkingSchemeFilesForTopic,
  type ImageTopic,
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
  onAdd: (attachments: AttachedQuestion[]) => void;
  onClose: () => void;
};

type Tab = "bank" | "upload";

export default function AddQuestionModal({ subject, onAdd, onClose }: Props) {
  const { user } = useContext(UserContext);
  const [tab, setTab] = useState<Tab>("bank");
  const [search, setSearch] = useState("");

  // ---- Bank: past papers ----
  const { papers, loading: papersLoading, getPaperQuestions } = useExamPapers(subject);
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [paperQuestions, setPaperQuestions] = useState<PaperQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  const isImageMode = !papersLoading && papers.length === 0;
  const storageFolder = useMemo(() => getStorageFolderName(subject), [subject]);

  // ---- Bank: image questions (subjects without papers) ----
  const [imageLevel, setImageLevel] = useState<string | null>(null);
  const {
    topics: imageTopics,
    levels: imageLevels,
    loading: topicsLoading,
  } = useImageTopics(isImageMode ? storageFolder : null, imageLevel);
  // Mirror useImageTopics' fallback so the level we record matches the topics shown.
  const activeImageLevel =
    (imageLevel && imageLevels.includes(imageLevel) ? imageLevel : imageLevels[0]) ?? null;
  const [selectedTopic, setSelectedTopic] = useState<ImageTopic | null>(null);
  const [groupedQuestions, setGroupedQuestions] = useState<GroupedImageQuestion[]>([]);
  const [topicMsFiles, setTopicMsFiles] = useState<MarkingSchemeFile[]>([]);

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
  const filteredGrouped = useMemo(() => {
    if (!searchLower) return groupedQuestions;
    return groupedQuestions.filter((g) => g.displayName.toLowerCase().includes(searchLower));
  }, [groupedQuestions, searchLower]);

  const handleAddSelection = () => {
    if (selection.size === 0) return;
    onAdd(Array.from(selection.values()));
    onClose();
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
      onAdd([attachment]);
      onClose();
    } catch (err) {
      console.error("[AddQuestionModal] upload failed:", err);
      setUploadError("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
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

  return (
    <WhiteboardModal
      title="Add question"
      onClose={onClose}
      maxWidthClass="max-w-xl"
      footer={
        tab === "bank" ? (
          <button
            type="button"
            className="w-full py-2.5 rounded-xl text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-default"
            onClick={handleAddSelection}
            disabled={selection.size === 0}
          >
            {selection.size === 0
              ? "Select questions to add"
              : `Add ${selection.size} question${selection.size === 1 ? "" : "s"}`}
          </button>
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
        <div className="flex gap-1 rounded-xl color-bg-grey-5 p-1">
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
        </div>

        {tab === "bank" && (
          <>
            <div className="relative">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 color-txt-sub pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  selectedPaper || selectedTopic ? "Search questions…" : isImageMode ? "Search topics…" : "Search papers…"
                }
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm color-bg-grey-5 color-txt-main placeholder:color-txt-sub outline-none"
                autoComplete="off"
              />
            </div>

            {(selectedPaper || selectedTopic) && (
              <button
                type="button"
                className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-sm font-semibold color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedPaper(null);
                  setSelectedTopic(null);
                  setSearch("");
                }}
              >
                <LuArrowLeft size={14} />
                {selectedPaper ? selectedPaper.label : selectedTopic?.displayName}
              </button>
            )}

            <div className="flex flex-col gap-1.5 min-h-[200px]">
              {papersLoading && (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                  ))}
                </>
              )}

              {/* Paper mode: paper list */}
              {!papersLoading && !isImageMode && !selectedPaper &&
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

              {/* Paper mode: question list */}
              {!papersLoading && selectedPaper && (
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

              {/* Image mode: level chips + topic list */}
              {!papersLoading && isImageMode && !selectedTopic && (
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
                          }}
                        >
                          {formatLevelCode(level)}
                        </button>
                      ))}
                    </div>
                  )}
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
                        <span className="shrink-0 text-xs color-txt-sub">{topic.questionCount} questions</span>
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

              {/* Image mode: grouped question list */}
              {!papersLoading && isImageMode && selectedTopic && (
                questionsLoading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 rounded-xl color-bg-grey-5 animate-pulse" />
                  ))
                ) : (
                  filteredGrouped.map((grouped) => {
                    const key = `image_${storageFolder}_${activeImageLevel}_${selectedTopic.name}_${grouped.key}`;
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

              {!papersLoading && !isImageMode && !selectedPaper && filteredPapers.length === 0 && (
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
