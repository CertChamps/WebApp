import { useParams, useNavigate } from "react-router-dom";
import { useReplies } from "../../hooks/useReplies";
import useQuestions from "../../hooks/useQuestions";
import usePosts from "../../hooks/usePosts";

import RenderMath from "../../components/math/mathdisplay";
import ConfirmationPrompt from "../../components/prompts/confirmation";
import PastPaperMarkingScheme from "../../components/questions/PastPaperMarkingScheme";
import CroppedPdfRegions, { type PdfRegion } from "../../components/questions/CroppedPdfRegions";

import { LuArrowLeft, LuArrowUpRight, LuImage, LuTrash, LuX } from "react-icons/lu";
import useNotifications from "../../hooks/useNotifications";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../context/UserContext";
import { getBlob, ref as storageRef } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { db, storage } from "../../../firebase";

export default function Replies() {
  const { id } = useParams<{ id: string }>();
  const { deletePost } = usePosts();
  const { timeAgoFormatter } = useNotifications();
  const { toRoman } = useQuestions();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [replyError, setReplyError] = useState<string>("");
  const [composerOpen, setComposerOpen] = useState(false);

  const {
    post,
    replies,
    newReply,
    setNewReply,
    attachPreview,
    setAttach,
    setAttachPreview,
    onPickFile,
    handleSendReply,
    randomPlaceholder,
    question,
  } = useReplies(id ?? "");

  const placeholders = [
    "Is no one locked in?...",
    "It's quiet here...",
    "Maybe go make some friends lol...",
    "Is everyone AFK?...",
    "Maybe replying was the friends we made along the way...",
    "Chat is this thread on airplane mode?...",
    "Damn CertChamps needs more users...",
    "Does this thread need a passcode to reply or something?...",
    "Is this thread my dating life?...",
    "Even my calculator gets more use than this thread...",
    "Maybe just ask your teacher...",
    "Remember when people used to talk?...",
    "CONGRATULATIONS you found the deadest thread on the platform!!!...",
  ];

  const [replyPlaceholder, setReplyPlaceholder] = useState("");
  const [paperBlob, setPaperBlob] = useState<Blob | null>(null);
  const [paperPageRange, setPaperPageRange] = useState<{ start: number; end: number } | null>(null);
  const [paperRegions, setPaperRegions] = useState<PdfRegion[] | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * placeholders.length);
    setReplyPlaceholder(placeholders[randomIndex]);
  }, []);

  useEffect(() => {
    if (!post?.isPaperQuestion || !post.paperId) return;
    let cancelled = false;
    setPaperLoading(true);

    (async () => {
      try {
        const subj = post.subject || "maths";
        const lvl = post.level || "higher";

        let sPath = post.storagePath as string | undefined;
        if (!sPath) {
          const paperId = post.paperId as string;
          const paperRef = doc(db, "questions", "leavingcert", "subjects", subj, "levels", lvl, "papers", paperId);
          const paperDoc = await getDoc(paperRef);
          sPath = paperDoc.data()?.storagePath as string | undefined;
        }

        let pRange = post.pageRange as [number, number] | null | undefined;
        let regions = post.pageRegions as PdfRegion[] | null | undefined;

        if ((!pRange || !regions) && post.paperQuestionId) {
          const paperId = post.paperId as string;
          const qRef = doc(db, "questions", "leavingcert", "subjects", subj, "levels", lvl, "papers", paperId, "questions", post.paperQuestionId);
          const qDoc = await getDoc(qRef);
          const data = qDoc.data();
          if (!pRange) {
            const raw = data?.pageRange;
            if (Array.isArray(raw) && raw.length >= 2) pRange = [raw[0], raw[1]];
          }
          if (!regions) {
            const raw = data?.pageRegions;
            if (Array.isArray(raw) && raw.length > 0) regions = raw as PdfRegion[];
          }
        }

        if (cancelled) return;
        if (pRange) setPaperPageRange({ start: pRange[0], end: pRange[1] });
        if (regions && regions.length > 0) setPaperRegions(regions);

        if (sPath) {
          const blob = await getBlob(storageRef(storage, sPath));
          if (!cancelled) setPaperBlob(blob);
        }
      } catch (err) {
        console.error("Failed to fetch paper PDF:", err);
      } finally {
        if (!cancelled) setPaperLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [post?.isPaperQuestion, post?.paperId]);

  const composerActive = composerOpen || Boolean(newReply.trim()) || Boolean(attachPreview);
  const hasLinkedQuestion = Boolean(post?.isFlashcard || post?.isPaperQuestion);

  const sendReply = () => {
    const longestSegment = newReply
      .split(" ")
      .filter(Boolean)
      .reduce((max, word) => Math.max(max, word.length), 0);

    if (newReply.trim().length > 500) {
      setReplyError("Reply cannot exceed 500 characters.");
      return;
    }
    if (longestSegment > 50) {
      setReplyError("spam detected, why are you doing this?");
      return;
    }
    handleSendReply();
    setReplyError("");
    setComposerOpen(false);
  };

  const cancelReply = () => {
    setNewReply("");
    setAttach(null);
    setAttachPreview(null);
    setReplyError("");
    setComposerOpen(false);
  };

  const openProfile = (userId?: string) => {
    if (userId) navigate(`/viewProfile/${userId}`);
  };

  const questionPanel = hasLinkedQuestion ? (
    <aside className="w-full lg:w-[22rem] xl:w-[26rem] shrink-0 flex flex-col min-h-0 lg:h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal space-y-4">
        {post?.isFlashcard && (
          <>
            <button
              type="button"
              onClick={() => navigate(`/practice/${post.flashcardId}`)}
              className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer"
            >
              <LuArrowUpRight size={16} />
              Go to question
            </button>
            {Array.isArray(question) &&
              question.length > 0 &&
              question.map((part, idx) => (
                <div key={part.id} className="space-y-2">
                  {question.length > 1 ? (
                    <p className="text-sm font-semibold color-txt-sub">{toRoman(idx + 1)})</p>
                  ) : null}
                  <RenderMath text={part.question} className="txt" />
                  {part.image && (
                    <img
                      src={part.image}
                      alt={`Question part ${idx + 1}`}
                      className="w-full rounded-xl object-cover"
                    />
                  )}
                </div>
              ))}
          </>
        )}

        {post?.isPaperQuestion && (
          <>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams({
                  mode: "pastpaper",
                  paperId: post.paperId ?? "",
                  indexInPaper: String(post.indexInPaper ?? 0),
                });
                navigate(`/practice/session?${params.toString()}`);
              }}
              className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer"
            >
              <LuArrowUpRight size={16} />
              Go to question
            </button>
            <div>
              <p className="font-bold color-txt-main">{post.paperLabel}</p>
              <p className="text-sm color-txt-sub mt-1">{post.paperQuestionName}</p>
            </div>
            {paperLoading && (
              <p className="text-sm color-txt-sub">Loading question…</p>
            )}
            {!paperLoading && paperBlob && paperRegions && paperRegions.length > 0 && (
              <div className="overflow-auto rounded-xl color-bg-grey-5">
                <CroppedPdfRegions
                  file={paperBlob}
                  regions={paperRegions}
                  pageWidth={500}
                />
              </div>
            )}
            {!paperLoading && paperBlob && !paperRegions && paperPageRange && (
              <div className="max-h-[600px] overflow-auto rounded-xl color-bg-grey-5">
                <PastPaperMarkingScheme
                  file={paperBlob}
                  pageRange={paperPageRange}
                  fillWidth
                />
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  ) : null;

  return (
    <div className="relative flex w-full h-full color-bg overflow-hidden">
      <ConfirmationPrompt
        open={showConfirmDelete}
        onConfirm={() => {
          deletePost(post?.id ?? "");
          setShowConfirmDelete(false);
        }}
        onCancel={() => setShowConfirmDelete(false)}
        title="Are you sure you want to delete this post?"
        message="you cannot revert this action"
        cancelText="No"
        confirmText="Yes"
      />

      <main className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-minimal">
        <div className="w-full px-6 pt-4 pb-6">
          <button
            type="button"
            onClick={() => navigate("/social/social")}
            className="inline-flex items-center gap-2 text-sm font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
          >
            <LuArrowLeft size={16} />
            Discussion
          </button>

          <div className={`mt-5 ${hasLinkedQuestion ? "lg:pr-[23.5rem] xl:pr-[27.5rem] relative" : ""}`}>
            {hasLinkedQuestion && (
              <div className="w-full mb-8 lg:mb-0 lg:absolute lg:inset-y-0 lg:right-0 lg:w-[22rem] xl:w-[26rem]">
                {questionPanel}
              </div>
            )}

            <div className="w-full">
              {!post ? (
                <div className="py-5 space-y-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full color-bg-grey-10" />
                    <div className="h-3 w-28 rounded color-bg-grey-10" />
                  </div>
                  <div className="h-4 w-full rounded color-bg-grey-10" />
                  <div className="h-4 w-2/3 rounded color-bg-grey-10" />
                </div>
              ) : (
                <>
                  <div className="py-5">
                    <div className="flex items-start gap-3">
                      {post.userImage ? (
                        <button
                          type="button"
                          onClick={() => openProfile(post.userId)}
                          className="shrink-0 cursor-pointer"
                        >
                          <img
                            src={post.userImage}
                            alt={post.username}
                            className="w-11 h-11 rounded-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-11 h-11 rounded-full color-bg-grey-10 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => openProfile(post.userId)}
                            className="text-[15px] font-bold color-txt-main truncate cursor-pointer hover:opacity-80"
                          >
                            {post.username}
                          </button>
                          <span className="text-sm color-txt-sub shrink-0">
                            {timeAgoFormatter(post.timestamp)}
                          </span>
                          {user?.uid === post.userId && (
                            <button
                              type="button"
                              onClick={() => setShowConfirmDelete(true)}
                              className="ml-auto inline-flex items-center justify-center rounded-lg p-1.5 color-txt-sub hover:color-bg-accent hover:color-txt-accent cursor-pointer"
                              aria-label="Delete post"
                            >
                              <LuTrash size={16} />
                            </button>
                          )}
                        </div>
                        {post.content ? (
                          <p className="mt-1.5 text-[16px] leading-relaxed color-txt-main whitespace-pre-wrap break-words">
                            {post.content}
                          </p>
                        ) : null}
                        {!post.isFlashcard && post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt="Post content"
                            className="mt-3 w-full rounded-2xl object-cover"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="h-px color-bg-grey-10" />

                  <div className="py-4">
                    <div className="rounded-2xl color-bg-grey-5 px-4 pt-3 pb-3">
                      <textarea
                        value={newReply}
                        onChange={(e) => setNewReply(e.target.value)}
                        onFocus={() => setComposerOpen(true)}
                        placeholder={randomPlaceholder}
                        rows={composerActive ? 4 : 3}
                        className="w-full min-h-[4.5rem] bg-transparent color-txt-main text-[16px] leading-relaxed outline-none resize-none placeholder:color-txt-sub"
                      />
                      {attachPreview && (
                        <div className="relative w-fit mt-2 mb-3">
                          <img
                            src={attachPreview}
                            alt="preview"
                            className="h-28 rounded-xl object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setAttach(null);
                              setAttachPreview(null);
                            }}
                            className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full color-bg color-txt-main cursor-pointer"
                            aria-label="Remove image"
                          >
                            <LuX size={12} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <label className="inline-flex items-center justify-center rounded-lg p-1.5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 cursor-pointer">
                            <LuImage size={18} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={onPickFile}
                            />
                          </label>
                          {replyError && (
                            <p className="text-xs text-red-500 truncate">{replyError}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={cancelReply}
                            className="px-3 py-1.5 rounded-xl text-sm font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={sendReply}
                            disabled={!newReply.trim() && !attachPreview}
                            className="px-5 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-bold hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px color-bg-grey-10" />

                  <div className="pt-5">
                    <h2 className="text-base font-bold color-txt-main mb-1">
                      {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
                    </h2>
                    {replies.length > 0 ? (
                      replies.map((reply, index) => (
                        <div key={reply.id}>
                          {index > 0 && <div className="h-px color-bg-grey-10" />}
                          <div className="py-4">
                            <div className="flex items-start gap-3">
                              {reply.userImage ? (
                                <button
                                  type="button"
                                  onClick={() => openProfile(reply.userId)}
                                  className="shrink-0 cursor-pointer"
                                >
                                  <img
                                    src={reply.userImage}
                                    alt={reply.username}
                                    className="w-9 h-9 rounded-full object-cover"
                                  />
                                </button>
                              ) : (
                                <div className="w-9 h-9 rounded-full color-bg-grey-10 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => openProfile(reply.userId)}
                                    className="text-[15px] font-bold color-txt-main truncate cursor-pointer hover:opacity-80"
                                  >
                                    {reply.username}
                                  </button>
                                  <span className="text-sm color-txt-sub shrink-0">
                                    {timeAgoFormatter(reply.timestamp)}
                                  </span>
                                </div>
                                {reply.content ? (
                                  <p className="mt-1 text-[15px] leading-relaxed color-txt-main whitespace-pre-wrap break-words">
                                    {reply.content}
                                  </p>
                                ) : null}
                                {reply.imageUrl && (
                                  <img
                                    src={reply.imageUrl}
                                    alt="Reply attachment"
                                    className="mt-2 max-h-52 rounded-xl object-cover"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="py-4 text-sm color-txt-sub">{replyPlaceholder}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
