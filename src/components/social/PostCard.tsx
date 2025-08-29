import { useEffect, useState } from "react";
import { storage } from "../../../firebase";
import { getDownloadURL, ref } from "firebase/storage";

interface PostCardProps {
    content: string;
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
    time,
    content,
    replyCount,
    imageURL,
    onPressReplies
  }) => {

    const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);



    // Format the time stamp. I thinky you would need to do a bit of
    // maths to get the whole 24hrs ago thing working, but this is a good start.
    // const formattedTime = time?.toDate?.()?.toLocaleTimeString([], {
    //     hour: '2-digit',
    //     minute: '2-digit'
    // }) ?? 'Just now';

    const formattedDate = time?.toDate?.()?.toLocaleDateString() ?? 'Unknown date';


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
                <span className="post-card-user-name">{username}</span>
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
            
            <div className="post-card-footer">
                <span>{formattedDate}</span>
                <span 
                    onClick={onPressReplies}
                    className="post-card-footer-replies"
                >
                    {replyCount} Replies
                </span>
            </div>
        </div>
    );
}

export default PostCard;