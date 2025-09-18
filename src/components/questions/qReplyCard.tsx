import React, { useEffect, useState } from "react";
import '../../styles/replies.css'

type QReplyCardProps = {
  content: string;
  userImage?: string;
  username?: string;
  time?: any; // Firestore Timestamp | Date | string
  replyCount?: number;
  onPressReply?: () => void;
  onPressReplies?: () => void;
  imageURL?: string; // optional image for the post body
};

const QReplyCard: React.FC<QReplyCardProps> = ({
  userImage,
  username,
  time,
  content,
  replyCount = 0,
  onPressReply,
  onPressReplies,
  imageURL,
}) => {
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setDisplayImageUrl(imageURL ?? null);
  }, [imageURL]);

  const formattedTime =
    time?.toDate?.()?.toLocaleTimeString?.([], { hour: "2-digit", minute: "2-digit" }) ??
    (time instanceof Date
      ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Just now");

  return (
    <div className="reply-container">
      {/* Header */}
      <div className="header-wrapper">
        {userImage ? (
          <img
            src={userImage}
            alt={username || "user"}
            className="header-img"
          />
        ) : (
          <div className="w-7 h-7 rounded-full mr-3" />
        )}
        <div className="header-text-wrapper">
          <span className="header-username">{username}</span>
          <span className="header-time">{formattedTime}</span>
        </div>
      </div>

      {/* Body */}
      <div className="border-l-2 color-shadow px-3 ml-3.5">
        {displayImageUrl && (
          <img
            src={displayImageUrl}
            alt="Post"
            className="content-img"
          />
        )}
        <p className="content-text">{content}</p>
      
      {/* Footer */}
      {(onPressReply || (replyCount > 0 && onPressReplies)) && (
        <div className="footer-wrapper">
          {onPressReply && (
            <button
              type="button"
              onClick={onPressReply}
              className="footer-txt hover:underline"
            >
              Reply
            </button>
          )}
          {replyCount > 0 && onPressReplies && (
            <button
              type="button"
              onClick={onPressReplies}
              className="footer-txt font-semibold hover:underline"
            >
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default QReplyCard;