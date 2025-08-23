import React, { useEffect, useState } from "react";

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
    <div className="bg-white rounded-lg p-4 w-full">
      {/* Header */}
      <div className="flex items-center mt-2 mb-3">
        {userImage ? (
          <img
            src={userImage}
            alt={username || "user"}
            className="w-7 h-7 rounded-full mr-3 object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full mr-3 bg-light-grey dark:bg-grey" />
        )}
        <div className="flex-1 flex items-center justify-between">
          <span className="txt-bold text-black dark:text-white">{username}</span>
          <span className="txt-sub text-grey dark:text-light-grey">{formattedTime}</span>
        </div>
      </div>

      {/* Body */}
      {displayImageUrl && (
        <img
          src={displayImageUrl}
          alt="Post"
          className="w-full h-[200px] object-cover rounded-lg my-3"
        />
      )}
      <p className="text-[20px] text-black dark:text-white mb-6">{content}</p>

      {/* Footer */}
      {(onPressReply || (replyCount > 0 && onPressReplies)) && (
        <div className="flex items-center gap-4 mb-1">
          {onPressReply && (
            <button
              type="button"
              onClick={onPressReply}
              className="flex items-center px-2 py-1 text-sm text-blue dark:text-blue-light hover:underline"
            >
              Reply
            </button>
          )}
          {replyCount > 0 && onPressReplies && (
            <button
              type="button"
              onClick={onPressReplies}
              className="flex items-center px-2 py-1 text-sm text-blue dark:text-blue-light font-semibold hover:underline"
            >
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default QReplyCard;