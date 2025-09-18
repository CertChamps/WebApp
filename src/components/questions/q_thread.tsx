// QThread.tsx
// React
import { useState, useContext, useEffect } from 'react';

// Firebase
import { db } from '../../../firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';

// Hooks
import { UserContext } from '../../context/UserContext';

// Components
import SubReplies from './SubReplies';

type questionType = {
  questionId: string;
  part: number;
};

const QThread = (props: questionType) => {
  const { user } = useContext(UserContext);
  const [message, setMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<
    { id: string; username: string; type: 'question' | 'reply' } | null
  >(null);

  //================================= GET THE REPLIES ===================================
  const [replies, setReplyData] = useState<
    {
      id: string;
      content: any;
      timestamp: any;
      username: string;
      userImage: string | null;
      replyCount?: number;
    }[]
  >([]);

  useEffect(() => {
    const fetchReplies = async () => {
      const q = query(
        collection(db, 'certchamps-questions', props.questionId, 'replies'),
        orderBy('timestamp', 'desc')
      );

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const replyData = await Promise.all(
          snapshot.docs.map(async (docSnap) => {
            const post = docSnap.data();
            const postId = docSnap.id;
            const userId = post.userId;

            // grab user data
            const userQ = query(collection(db, 'user-data'), where('uid', '==', userId));
            const userSnap = await getDocs(userQ);

            let username = 'Unknown';
            let userImage = null;

            if (!userSnap.empty) {
              const userData = userSnap.docs[0].data();
              username = userData.username;

              try {
                const storage = getStorage();
                const imageRef = ref(storage, userData.picture);
                userImage = await getDownloadURL(imageRef);
              } catch (err) {
                console.warn('Image error:', err);
              }
            }

            // count nested replies (if needed)
            let replyCount = 0;
            try {
              const repliesSnap = await getDocs(collection(db, 'posts', postId, 'replies'));
              replyCount = repliesSnap.size;
            } catch (err) {
              // ignore
            }

            return {
              id: docSnap.id,
              content: post.content,
              timestamp: post.timestamp,
              username,
              userImage,
              replyCount,
            };
          })
        );
        setReplyData(replyData);
      });

      return () => unsubscribe();
    };

    if (props.questionId) {
      fetchReplies();
    }
  }, [props.questionId]);
  //=========================================================================================

  //================= Get image URL for this part (if any) ================================
  const getImage = async (): Promise<string> => {
    const label = `q${props.part + 1}`;
    const docRef = doc(db, 'certchamps-questions', props.questionId, 'content', label);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return '';
    const path = docSnap.data().image as string | undefined;
    if (!path) return '';
    const url = await getDownloadURL(ref(getStorage(), path));
    return url;
  };
  //=========================================================================================

  //========================================SEND POST!!!=====================================
  const sendPost = async () => {
    if (!message.trim()) return;

    try {
      const image = await getImage();

      if (replyingTo && replyingTo.type === 'reply') {
        // nested reply
        await addDoc(
          collection(db, 'certchamps-questions', props.questionId, 'replies', replyingTo.id, 'replies'),
          {
            userId: user.uid,
            content: message.trim(),
            timestamp: serverTimestamp(),
            replyingTo: replyingTo.id,
            replyingToUser: replyingTo.username,
          }
        );
      } else {
        const practiceReplyDoc = await addDoc(
          collection(db, 'certchamps-questions', props.questionId, 'replies'),
          {
            userId: user.uid,
            content: message.trim(),
            timestamp: serverTimestamp(),
          }
        );

        // also create a social post
        await addDoc(collection(db, 'posts'), {
          userId: user.uid,
          content: message.trim(),
          timestamp: serverTimestamp(),
          imageUrl: image,
          likes: 0,
          isFlashcard: true,
          flashcardId: props.questionId,
          replyId: practiceReplyDoc.id,
        });
      }

      setMessage('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message: ', error);
    }
  };
  //=========================================================================================

  //================================ Helpers =================================================
  const handleReplyToComment = (commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username, type: 'reply' });
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPost();
    }
  };
  //=========================================================================================

  return (
    // Make this a constrained flex column so the parent can limit height.
    // min-h-0 is important so in a flex parent the child is allowed to be smaller than content.
    <div className="h-full min-h-0 flex flex-col">
      {/* Replies list: flex-1 and overflow-auto so it scrolls without expanding parent */}
      <div className="mx-auto max-w-3xl w-full  px-3 pt-2 flex-1 overflow-auto">
        {replies.map((post) => (
          <SubReplies
            key={post.id}
            reply={post}
            questionId={props.questionId}
            onReply={handleReplyToComment}
          />
        ))}
      </div> 

      {/* Composer: flex-none so it doesn't grow; will sit below the scrollable list */}
      <div className="composer-container flex-none p-3">
        {replyingTo && (
          <div className="composer-replyTo-wrapper flex items-center justify-between mb-2">
            <span className="composer-replyTo-username text-sm text-muted">
              Replying to <span className="txt-bold">@{replyingTo.username}</span>
            </span>
            <button onClick={cancelReply} className="composer-replyTo-cancel text-sm" type="button">
              Cancel
            </button>
          </div>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something exquisite..."
          rows={3}
          className="composer-text-box w-full p-2 rounded border-none h-11"
        />

        <div className="composer-footer-wrapper flex items-center justify-between mt-2">
          <button type="button" onClick={cancelReply} className="composer-clear text-sm px-3 py-1">
            Clear
          </button>
          <button
            type="button"
            onClick={sendPost}
            disabled={!message.trim()}
            className="composer-post text-sm px-3 py-1 bg-accent text-white rounded disabled:opacity-50 font-bold color-txt-accent"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default QThread;