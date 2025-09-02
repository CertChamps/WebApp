// Hooks 
import { useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom"
import usePosts from "../../hooks/usePosts";
import useNotifications from "../../hooks/useNotifications";

// Context
import { UserContext } from "../../context/UserContext";

// Icons 
import { LuImage, LuMessageCircleMore, LuReply } from "react-icons/lu";



export default function PostViewer() {

    // Hooks 
    const { id } = useParams<{ id: string }>();
    const { post, replies } = usePosts(id ?? "")
    const {timeAgoFormatter} = useNotifications()

    // Context
    const { user } = useContext(UserContext)

    // State 
    const [message, setMessage] = useState('');

    // Image upload
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    useEffect(() => { console.log(replies) }, [replies])

    return (
        <div className="w-h-container p-4 pb-0">
            <div className="w-2/3 h-full overflow-y-scroll">

                {/* ============================================== OG POST ============================================== */}
                <div className="post-card-main">

                    <div className="post-card-user">
                        <img 
                            src={post?.picture} 
                            alt={post?.username} 
                            className="post-card-user-img" 
                        />
                        <div>
                            <p className="post-card-user-name">{post?.username}</p>
                            <p className="post-card-user-rank">Level: {post?.rank}</p> 
                        </div>
                        <span className="post-card-date">{timeAgoFormatter(post?.timestamp)}</span>
                    </div>
                    
                    <div className="post-card-content">
                        <p className="post-card-content-txt">{post?.content}</p>
                    </div>

                    <div className="post-card-footer">
                        <LuMessageCircleMore size={24} strokeWidth={1}/>
                        <span   
                            className="post-card-footer-replies mx-0.5"
                        >
                            {post?.replyCount} 
                        </span>
                    </div> 
                                  
                </div>
                {/* ===================================================================================================== */}

                {/* ============================================ PLACEHOLDER============================================= */}
                <div className="compose-post-container py-4! px-0! ">
                    <div className="compose-post-text-wrapper min-h-15! h-16! "> 
                        <img 
                            src={user.picture}
                            className="compose-post-img"
                            />
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            //   onKeyDown={handleKeyDown}
                            //placeholder={randomPlaceholder} 
                            placeholder="Write a reply..."
                            //rows={3}
                            className={`compose-post-text-box`}
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
                            onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setImageFile(f);
                            setImagePreview(URL.createObjectURL(f));
                            }}
                        />
                        </label>
                        {imagePreview && (
                        <div className="flex items-center gap-2">
                            <img
                            src={imagePreview}
                            alt="preview"
                            className="w-16 h-16 rounded object-cover border"
                            />
                            <button
                            type="button"
                            onClick={() => {
                                setImageFile(null);
                                setImagePreview(null);
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
                                onClick={() => {/* clear function */}}
                                className="compose-post-clear-button"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => { /* send a reply */}}
                                disabled={!message.trim()}
                                className="cursor-target compose-post-send-button"
                            >
                                Reply
                            </button>
                        </div>
                    </div>
                </div>
                {/* ===================================================================================================== */}

                {/* ============================================== REPLIES  ============================================== */}
                { replies.map( ( reply: any) => (
                <div>

                    {/* ============================================ REPLIES ============================================= */}
                    <div className="reply-card-main pb-0!">

                        <div className="post-card-user">
                            <img 
                                src={reply?.picture} 
                                alt={reply?.username} 
                                className="post-card-user-img" 
                            />
                            <div>
                                <p className="post-card-user-name">{reply?.username}</p>
                                <p className="post-card-user-rank">Level: {reply?.rank}</p> 
                            </div>
                            <span className="post-card-date">{timeAgoFormatter(reply?.timestamp)}</span>
                        </div>
                        
                        <div className="reply-card-content pb-3 ">
                            <p className="post-card-content-txt">{reply?.content}</p>
                            <div>
                                <LuReply/>
                            </div>
                        </div>
                    </div> 
                    {/* ================================================================================================ */}
                     
                    {/* ======================================= NESTED REPLIES ========================================= */}
                    {reply?.nestedReplies?.map((nestedReply: any) => (
                        // Render nested reply here, e.g.:
                        <div className="reply-card-main ml-7 border-l-2 color-shadow">
                            <div className="post-card-user">
                                <img 
                                    src={nestedReply?.picture} 
                                    alt={nestedReply?.username} 
                                    className="post-card-user-img" 
                                />
                                <div>
                                    <p className="post-card-user-name">{nestedReply?.username}</p>
                                    <p className="post-card-user-rank">Level: {nestedReply?.rank}</p> 
                                </div>
                                <span className="post-card-date">{timeAgoFormatter(nestedReply?.timestamp)}</span>
                            </div>
                            <div className="post-card-content">
                                <p className="post-card-content-txt">{nestedReply?.content}</p>
                            </div>
                        </div>
                    ))}
                    {/* ================================================================================================ */}

                </div>
                ))}
                {/* ===================================================================================================== */}


            </div>
        </div>
    )
}