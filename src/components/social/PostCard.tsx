import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { storage } from "../../../firebase";
import { getDownloadURL, ref } from "firebase/storage";
import useNotifications from "../../hooks/useNotifications";
import { LuMessageCircle } from "react-icons/lu"

interface PostCardProps {
    content: string;
    userId?: string;
    rank?: number;
    userImage?: string;
    username?: string;
    time?: any;
    replyCount?: number;
    imageURL?: string;
    isFlashcard?: boolean;
    onPressReplies?: () => void;
  }

  const PostCard: React.FC<PostCardProps> = ({
    userImage,
    username,
    userId,
    rank: _rank,
    time,
    content,
    replyCount,
    imageURL,
    onPressReplies
  }) => {

    const navigate = useNavigate()
    const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
    const {timeAgoFormatter} = useNotifications()
    const formattedDate = timeAgoFormatter(time)
    const replies = replyCount ?? 0

    const handleUserClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (userId) {
            navigate(`/viewProfile/${userId}`)
        }
    }

    useEffect(() => {
        const fetchImageUrl = async () => {
            if (imageURL) {
                try {
                    if (imageURL.startsWith("http")) {
                        setDisplayImageUrl(imageURL);
                        return;
                    }
                    const imageRef = ref(storage, imageURL);
                    const imageUrl = await getDownloadURL(imageRef);
                    setDisplayImageUrl(imageUrl);
                } catch (error) {
                    console.error('Error fetching image:', error);
                    setDisplayImageUrl(null);
                }
            } else {
                    setDisplayImageUrl(null);
            }
        };
    
        fetchImageUrl();
    }, [imageURL]);
  
    return (
        <article
            className="px-1 py-5 cursor-pointer hover:color-bg-grey-5 transition-colors"
            onClick={onPressReplies}
        >
            <div className="flex items-start gap-3">
                {userImage ? (
                    <img
                        src={userImage}
                        alt={username}
                        className="w-11 h-11 rounded-full object-cover shrink-0 cursor-pointer"
                        onClick={handleUserClick}
                    />
                ) : (
                    <div className="w-11 h-11 rounded-full color-bg-grey-10 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                        <button
                            type="button"
                            className="text-[15px] font-bold color-txt-main truncate cursor-pointer hover:opacity-80"
                            onClick={handleUserClick}
                        >
                            {username}
                        </button>
                        <span className="text-sm color-txt-sub shrink-0">{formattedDate}</span>
                    </div>
                    {content ? (
                        <p className="mt-1.5 text-[16px] leading-relaxed color-txt-main whitespace-pre-wrap break-words">
                            {content}
                        </p>
                    ) : null}
                    {displayImageUrl && (
                        <img
                            src={displayImageUrl}
                            alt="Post content"
                            className="mt-3 max-h-[28rem] w-full rounded-2xl object-cover"
                        />
                    )}
                    <div className="mt-3 flex items-center">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold color-txt-sub">
                            <LuMessageCircle size={17} />
                            {replies}
                            <span className="font-medium">{replies === 1 ? "reply" : "replies"}</span>
                        </span>
                    </div>
                </div>
            </div>
        </article>
    );
}

export default PostCard;
