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
    isFlashcard,
    onPressReplies
  }) => {

    const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);



    // Format the time stamp. I thinky you would need to do a bit of
    // maths to get the whole 24hrs ago thing working, but this is a good start.
    const formattedTime = time?.toDate?.()?.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    }) ?? 'Just now';

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
        <div className="bg-white dark:bg-black border border-light-grey dark:border-grey rounded-lg shadow-small p-4 mb-4 w-full">
            <div className="flex items-center mb-3">
                <img 
                    src={userImage} 
                    alt={username} 
                    className="w-10 h-10 rounded-full mr-3 object-cover border border-light-grey dark:border-grey" 
                />
                <span className="txt-bold text-black dark:text-white">{username}</span>
            </div>
            
            <div className="mb-3">
                <p className="txt text-black dark:text-white mb-2">{content}</p>
                {displayImageUrl && (
                    <img 
                        src={displayImageUrl} 
                        alt="Post content" 
                        className="w-full max-w-lg rounded-lg object-cover border border-light-grey dark:border-grey"
                    />
                )}
            </div>
            
            <div className="flex justify-between items-center text-grey dark:text-light-grey txt-sub">
                <span>{formattedDate}</span>
                <span 
                    onClick={onPressReplies}
                    className="cursor-pointer hover:text-blue dark:hover:text-blue-light transition-colors"
                >
                    {replyCount} Replies
                </span>
            </div>
        </div>
    );
}

export default PostCard;