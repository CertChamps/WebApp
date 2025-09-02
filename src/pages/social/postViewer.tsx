// Hooks 
import { useParams } from "react-router-dom"
import usePosts from "../../hooks/usePosts";
import { useContext, useEffect, useState } from "react";
import useNotifications from "../../hooks/useNotifications";
import { LuImage, LuMessageCircleMore } from "react-icons/lu";
import { UserContext } from "../../context/UserContext";


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

    useEffect(() => { console.log(post) }, [post])

    return (
        <div className="w-h-container p-8">
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
                <div className="compose-post-container">
                    <div className="compose-post-text-wrapper"> 
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
                                onClick={() => {}}
                                className="compose-post-clear-button"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => {}}
                                disabled={!message.trim()}
                                className="cursor-target compose-post-send-button"
                            >
                                Post
                            </button>
                        </div>
                    </div>
                </div>
                {/* ===================================================================================================== */}



            </div>
        </div>
    )
}