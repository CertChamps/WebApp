// Hooks
import { useParams, useNavigate } from "react-router-dom";
import { useReplies } from "../../hooks/useReplies";
import useQuestions from "../../hooks/useQuestions";
import usePosts from "../../hooks/usePosts";


// Components
import RenderMath from "../../components/math/mathdisplay";
import ConfirmationPrompt from "../../components/prompts/confirmation";
import PastPaperMarkingScheme from "../../components/questions/PastPaperMarkingScheme";
import CroppedPdfRegions, { type PdfRegion } from "../../components/questions/CroppedPdfRegions";

// Icons
import { LuImage, LuTrash } from "react-icons/lu";
import useNotifications from "../../hooks/useNotifications";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../context/UserContext";
import { getBlob, ref as storageRef } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { db, storage } from "../../../firebase";



export default function Replies(
) {
  const { id } = useParams<{ id: string }>();
  const { deletePost } = usePosts();
  const { timeAgoFormatter } = useNotifications()
  const { toRoman } = useQuestions()
  const navigate = useNavigate()
  const { user } = useContext(UserContext);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [ replyError, setReplyError ] = useState<string>("");

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
    fcAuthor,
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
      console.log(fcAuthor) //unused
  
      //This will just pick a random placeholder whenever the screen renders
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
                const paperRef = doc(db, "questions", "leavingcert", "subjects", subj, "levels", lvl, "papers", post.paperId);
                const paperDoc = await getDoc(paperRef);
                sPath = paperDoc.data()?.storagePath as string | undefined;
              }

              let pRange = post.pageRange as [number, number] | null | undefined;
              let regions = post.pageRegions as PdfRegion[] | null | undefined;

              if ((!pRange || !regions) && post.paperQuestionId) {
                const qRef = doc(db, "questions", "leavingcert", "subjects", subj, "levels", lvl, "papers", post.paperId, "questions", post.paperQuestionId);
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


      const sendReply = () => {
        const longestSegment = newReply
          .split(" ")
          .filter(Boolean)
          .reduce((max, word) => Math.max(max, word.length), 0);


        if (newReply.trim().length > 500) {
          setReplyError("Reply cannot exceed 500 characters.");
          return;
        }
        else if (longestSegment > 50) {
          setReplyError("spam detected, why are you doing this?");
          return;
        }
        else {
          handleSendReply();
          setReplyError("");
        }
      }

  return (
    <div className="w-h-container p-4 pb-0 items-start">
      <ConfirmationPrompt open={showConfirmDelete} onConfirm={() => {deletePost(post?.id ?? ""); setShowConfirmDelete(false);}} 
        onCancel={() => setShowConfirmDelete(false)} title="Are you sure you want to delete this post? " message="you cannot revert this action" 
        cancelText="No" confirmText="Yes"
      />
      <div className="w-full h-full overflow-y-scroll scrollbar-minimal">


        {/* ============================================== OG POST ============================================== */}
        {post && (
          <div className="post-card-main ">
            <div className="post-card-user">
              {post.userImage && (
                <img
                  src={post.userImage}
                  alt={post.username}
                  className="post-card-user-img"
                />
              )}
              <div>
                <p className="post-card-user-name">{post.username}</p>
                {/* <p className="post-card-user-rank">Level: {post.rank ?? 1}</p> */}
              </div>
              <span className="post-card-date">{timeAgoFormatter(post.timestamp)}</span>
              {
                user?.uid === post?.userId ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(true)}
                  className="cursor-target blue-btn p-2 w-10 flex justify-center items-center cursor-pointer"
                >
                  <LuTrash size={20} /> 
                </button>) : (<></>)
              }
            </div>
              


            <div className="post-card-content">
              <p className="post-card-content-txt">{post.content}</p>
              {!post.isFlashcard && post.imageUrl && (
                <img
                  src={post.imageUrl}
                  alt="Post content"
                  className="w-full max-w-lg rounded-lg object-cover mt-2"
                />
              )}
            </div>
          </div>
        )}
        {/* ===================================================================================================== */}

        {/* ============================================== REPLY BOX ============================================ */}
        <div className="compose-post-container py-4! px-0!  z-10">
          <div className="compose-post-text-wrapper min-h-15! h-16!">
            <textarea
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder={randomPlaceholder}
              className="compose-post-text-box"
            />
          </div>

          <div className="flex justify-between items-center gap-2 mt-2">
            <div className="flex items-center gap-3">
              <label className="color-txt-sub mx-2 hover:opacity-80 cursor-pointer">
                <LuImage size={32} strokeWidth={1.5} />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                />
              </label>
              {attachPreview && (
                <div className="flex items-center gap-2">
                  <img
                    src={attachPreview}
                    alt="preview"
                    className="w-16 h-16 rounded object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAttach(null);
                      setAttachPreview(null);
                    }}
                    className="px-2 py-1 rounded bg-red-500 text-white"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <div>
              <span className="text-red-500 ml-4">{replyError}</span>
              <button
                type="button"
                onClick={() => {
                  setNewReply("");
                  setAttach(null);
                  setAttachPreview(null);
                }}
                className="compose-post-clear-button"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={sendReply}
                disabled={!newReply.trim() && !attachPreview}
                className="cursor-target compose-post-send-button"
              >
                Reply
              </button>
            </div>
          </div>
        </div>
        {/* ===================================================================================================== */}
        {/* ============================================== REPLIES ============================================== */}
        <h2 className="txt-heading color-txt-sub mb-2">Replies</h2>
        {replies.length > 0 ? (
          replies.map((reply) => (
            <div key={reply.id} className="reply-card-main py-1! ">
              <div className="post-card-user">
                {reply.userImage && (
                  <img
                    src={reply.userImage}
                    alt={reply.username}
                    className="post-card-user-img"
                  />
                )}
                <div>
                  <p className="post-card-user-name">{reply.username}</p>
                  {/* <p className="post-card-user-rank">Level: {reply.rank ?? 1}</p> */}
                </div>
                <span className="post-card-date">{timeAgoFormatter(reply.timestamp)}</span>
              </div>
              <div className="reply-card-content"> 
                <p className="post-card-content-txt">{reply.content}</p>
                {reply.imageUrl && (
                  <img
                    src={reply.imageUrl}
                    alt="Reply attachment"
                    className="w-full rounded-lg object-contain mt-2 max-w-50 max-h-50"
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="ml-2 txt-sub">{replyPlaceholder}</p>
        )}
        {/* ===================================================================================================== */}
      </div>

      {/* ============================================== FLASHCARD ============================================== */}
        {post?.isFlashcard && (
            <div className="mx-4 w-1/2">
              <div className="mx-auto w-[90%] color-bg-accent txt-heading-colour text-center py-1.5 rounded-out mb-6
                hover:scale-95 duration-200 cursor-pointer"
                 onClick={() => {navigate(`/practice/${post.flashcardId}`)}}>
                <p>Go To Question</p>
              </div>
              {Array.isArray(question) &&
                question.length > 0 &&
                question.map((part, idx) => (
                  <div key={part.id} className="mb-2 mx-4">
                    { question.length > 1 ? <p className="font-semibold txt inline">{toRoman(idx + 1)})  </p> : <></> }
                    <RenderMath text={part.question} className="txt inline" />
                    {part.image && (
                      <img
                        src={part.image}
                        alt={`Question part ${idx + 1}`}
                        className="w-full max-w-lg rounded-lg object-cover"
                      />
                    )}
                    <div className=" h-0 border-1 color-shadow my-6"></div>
                  </div>
                ))}
            </div>
        )}
      {/* ===================================================================================================== */}

      {/* ============================================ PAPER QUESTION ============================================ */}
        {post?.isPaperQuestion && (
            <div className="mx-4 w-1/2">
              <div className="mx-auto w-[90%] color-bg-accent txt-heading-colour text-center py-1.5 rounded-out mb-6
                hover:scale-95 duration-200 cursor-pointer"
                 onClick={() => {
                   const params = new URLSearchParams({
                     mode: "pastpaper",
                     paperId: post.paperId ?? "",
                     indexInPaper: String(post.indexInPaper ?? 0),
                   });
                   navigate(`/practice/session?${params.toString()}`);
                 }}>
                <p>Go To Question</p>
              </div>
              <div className="mx-4 mb-4">
                <p className="font-semibold color-txt-main text-lg">{post.paperLabel}</p>
                <p className="color-txt-sub mb-4">{post.paperQuestionName}</p>
                {paperLoading && (
                  <p className="color-txt-sub text-sm py-4">Loading question…</p>
                )}
                {!paperLoading && paperBlob && paperRegions && paperRegions.length > 0 && (
                  <div className="overflow-auto rounded-lg">
                    <CroppedPdfRegions
                      file={paperBlob}
                      regions={paperRegions}
                      pageWidth={500}
                    />
                  </div>
                )}
                {!paperLoading && paperBlob && !paperRegions && paperPageRange && (
                  <div className="max-h-[600px] overflow-auto rounded-lg">
                    <PastPaperMarkingScheme
                      file={paperBlob}
                      pageRange={paperPageRange}
                      fillWidth
                    />
                  </div>
                )}
              </div>
            </div>
        )}
      {/* ===================================================================================================== */}
    </div>
  );
}
