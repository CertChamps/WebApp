import { useEffect, useState } from "react";
import { storage } from "../../../firebase";
import { getDownloadURL, ref } from "firebase/storage";
import useNotifications from "../../hooks/useNotifications";

// Styles and Icons 
import { LuMessageCircleMore } from "react-icons/lu"

interface PostCardProps {
    content: string;
    rank?: number;
    userImage?: string;
    username?: string;
    time?: any; // Firestore Timestamp
    replyCount?: number;
    imageURL?: string; // Optional image URL for the post
    isFlashcard?: boolean; 
    onPressReplies?: () => void;
  }
  

  const PostCard: React.FC<PostCardProps> = ({
    userImage,
    username,
    rank,
    time,
    content,
    replyCount,
    imageURL,
    onPressReplies
  }) => {

    const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
    const {timeAgoFormatter} = useNotifications()
    const formattedDate = timeAgoFormatter(time)

    //======================== Fetch Image URL from Firebase Storage =========================
    useEffect(() => {
        const fetchImageUrl = async () => {
            if (imageURL) {
                try {
                    const imageRef = ref(storage, imageURL);
                    const imageUrl = await getDownloadURL(imageRef);
                    setDisplayImageUrl(imageUrl);
                    console.log(imageUrl);
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
                    className="post-card-user-img" 
                />
                <div>
                    <p className="post-card-user-name">{username}</p>
                    <p className="post-card-user-rank">Level: {rank}</p> 
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