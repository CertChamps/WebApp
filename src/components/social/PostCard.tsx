import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { storage } from "../../../firebase";
import { getDownloadURL, ref } from "firebase/storage";
import useNotifications from "../../hooks/useNotifications";

// Styles and Icons 
import { LuMessageCircleMore } from "react-icons/lu"

interface PostCardProps {
    content: string;
    userId?: string;
    rank?: number;
    userImage?: string;
    username?: string;
    time?: any; // Firestore Timestamp
    replyCount?: number;
    imageURL?: string; // Optional image URL for the post
    isFlashcard?: boolean; 
    onPressReplies?: () => void;
  }

    const rankNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"];

    const formatRankName = (rank?: number) => {
        if (!rank || rank < 1) return "Unranked";
        return rankNames[Math.min(rankNames.length - 1, rank - 1)] || "Unranked";
    };
  

  const PostCard: React.FC<PostCardProps> = ({
    userImage,
    username,
    userId,
    rank,
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

    const handleUserClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (userId) {
            navigate(`/viewProfile/${userId}`)
        }
    }

    //======================== Fetch Image URL from Firebase Storage =========================
    useEffect(() => {
        const fetchImageUrl = async () => {
            if (imageURL) {
                try {
                    const imageRef = ref(storage, imageURL);
                    const imageUrl = await getDownloadURL(imageRef);
                    setDisplayImageUrl(imageUrl);
                    // console.log(imageUrl);
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
    //==========================================================================================
  
    return (
        <div className="post-card-main">
            <div className="post-card-user">
                <img 
                    src={userImage} 
                    alt={username} 
                    className="post-card-user-img cursor-pointer" 
                    onClick={handleUserClick}
                />
                <div>
                    <p className="post-card-user-name cursor-pointer hover:opacity-80 transition-opacity" onClick={handleUserClick}>{username}</p>
                    <p className="post-card-user-rank">{formatRankName(rank)}</p> 
                </div>
                <span className="post-card-date">{formattedDate}</span>
            </div>
            
            <div className="post-card-content">
                <p className="post-card-content-txt">{content}</p>
                {displayImageUrl && (
                    <img 
                        src={displayImageUrl} 
                        alt="Post content" 
                        className="post-card-content-img"
                    />
                )}
            </div>
            
            <div className="post-card-footer" onClick={onPressReplies}>
                <LuMessageCircleMore size={24} strokeWidth={1}/>
                <span   
                    className="post-card-footer-replies mx-0.5"
                >
                    {replyCount} 
                </span>
            </div>
        </div>
    );
}

export default PostCard;