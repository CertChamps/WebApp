// Hooks
import { useParams, useNavigate } from "react-router-dom";
import { useReplies } from "../../hooks/useReplies";
import useQuestions from "../../hooks/useQuestions";


// Components
import RenderMath from "../../components/math/mathdisplay";

// Icons
import { LuImage } from "react-icons/lu";
import useNotifications from "../../hooks/useNotifications";

export default function Replies(
) {
  const { id } = useParams<{ id: string }>();
  const { timeAgoFormatter } = useNotifications()
  const { toRoman } = useQuestions()
  const navigate = useNavigate()

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

  return (
    <div className="w-h-container p-4 pb-0 items-start">
      <div className="w-full h-full overflow-y-scroll">


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
                onClick={handleSendReply}
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
                    className="w-full max-w-md rounded-lg object-cover mt-2"
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="ml-2 txt-sub">It's quiet here...</p>
        )}
        {/* ===================================================================================================== */}
      </div>

      {/* ============================================== FLASCHARD ============================================== */}
        {post?.isFlashcard && (
            <div className="mx-4">
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
                    {/* <p className="mb-2">{part.question}</p> */}
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
    </div>
  );
}
