// React
import { useState, useContext, useEffect } from 'react';

// Firebase
import { db }from '../../../firebase'
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';

// Hooks
import { UserContext } from '../../context/UserContext';

// Components
import SubReplies from './SubReplies';



type questionType = {
    questionId: string
    part: number
}



const QThread = (props: questionType) => {

    const { user } = useContext(UserContext);
    const [ message, setMessage ] = useState('');
    const [ replyingTo, setReplyingTo ] = useState<{ id: string; username: string; type: 'question' | 'reply' } | null>(null);


    //================================= GET THE REPLIES ===================================
    const [ replies, setReplyData ] = useState<{ id: string; content: any; timestamp: any; username: string; userImage: string | null; }[]>([]);

    useEffect(() => {
        const fetchReplies = async () => {
            const q = query(
                collection(db,'certchamps-questions', props.questionId, 'replies'),
                orderBy('timestamp', 'desc')
            );

            const unsubscribe = onSnapshot( q, async(snapshot) => {
                const replyData = await Promise.all(
                    snapshot.docs.map(async (docSnap) => {
                        const post = docSnap.data();
                        const postId = docSnap.id; //So we have the post ID
                        const userId = post.userId; //userID

                        //now as per usual we grab the users data
                        const userQ = query(collection(db, 'user-data'), where('uid', '==', userId));
                        const userSnap = await getDocs(userQ);
                          
                        let username = "Unknown";
                        let userImage = null;
                          
                        if (!userSnap.empty) {
                            const userData = userSnap.docs[0].data();
                            username = userData.username;
                          
                            try {
                                const storage = getStorage();
                                const imageRef = ref(storage, userData.picture);
                                userImage = await getDownloadURL(imageRef);
                            } catch (err) {
                                console.warn("Image error:", err);
                            }
                        }

                        //This will just grab the reply documents
                        const repliesSnap = await getDocs(
                            collection(db, 'posts', postId, 'replies')
                        );
                        //And using the .size modifier we can grab the number of replys
                        const replyCount = repliesSnap.size;

                        //Dont forget returns
                        return {
                            id: docSnap.id,
                            content: post.content,
                            timestamp: post.timestamp,
                            username,
                            userImage,
                            replyCount
                        };
                    })
                )
                setReplyData(replyData);
            })
            return () => unsubscribe();
        }
        fetchReplies(); 
    }, [props.questionId]);
    //=========================================================================================



    //=================This is just to grab the images URL to add to the doc===================

    //It is useful to note this will be called in the following sendPost function
    const getImage = async (): Promise<string> => {
      const label = `q${props.part + 1}`;
      const docRef = doc(db, "certchamps-questions", props.questionId, "content", label);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return "";
      const path = docSnap.data().image as string | undefined;
      if (!path) return "";
      const url = await getDownloadURL(ref(getStorage(), path));
      return url; // store URL in posts.imageUrl
    };
    //=========================================================================================


    //========================================SEND POST!!!=====================================
    const sendPost = async () => {
        if (!message.trim()) return;
    
        try {
            const image = await getImage(); //Need to get the image as we will put this in the doc
            console.log(image)
            //Create the reply docs conditionally
            //The replyingTo is a useState above and is changed in the handleReplyToComment function below.
            if (replyingTo && replyingTo.type === 'reply') {
                // Reply to a specific reply (nested reply)
                await addDoc(collection(db, 'certchamps-questions', props.questionId, 'replies', replyingTo.id, 'replies'), {
                    userId: user.uid,
                    content: message.trim(),
                    timestamp: serverTimestamp(),
                    replyingTo: replyingTo.id,
                    replyingToUser: replyingTo.username,
                });
            } else {
                
                const practiceReplyDoc = await addDoc(collection(db, 'certchamps-questions', props.questionId, 'replies'), {
                    userId: user.uid,
                    content: message.trim(),
                    timestamp: serverTimestamp(),
                });
                //We also want this to be an actual post in the social tab
                await addDoc(collection(db, 'posts'), {
                    userId: user.uid,
                    content: message.trim(),
                    timestamp: serverTimestamp(),
                    imageUrl: image,
                    likes: 0,
                    isFlashcard: true,
                    flashcardId: props.questionId,
                    replyId: practiceReplyDoc.id, //We add this so we can get just the replies replies
                });

                console.log('Created social post for practice reply:', practiceReplyDoc.id);
            }

            setMessage('');
            setReplyingTo(null);
        } catch(error) {
            console.error("Error sending message: ", error)
        }
    }
    //=========================================================================================



    //================================ Babys ==================================================
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
        <div className="flex flex-col h-full min-h-0 overflow-y-auto">
          {/* Replies list */}
          <div className="mx-auto max-w-3xl w-full space-y-4 flex-1 pb-28 px-3 pt-2">
            {replies.map((post: any) => (
              <SubReplies
                key={post.id}
                reply={post}
                questionId={props.questionId}
                onReply={handleReplyToComment}
              />
            ))}
          </div>
      
          {/* Composer - fixed within this column */}
          <div className="composer-container">
            {replyingTo && (
              <div className="composer-replyTo-wrapper">
                <span className="composer-replyTo-username">
                  Replying to <span className="txt-bold">@{replyingTo.username}</span>
                </span>
                <button
                  onClick={cancelReply}
                  className="composer-replyTo-cancel"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            )}
      
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Say something excuisite..."
              rows={3}
              className="composer-text-box"
            />
      
            <div className="composer-footer-wrapper">
              <button
                type="button"
                onClick={cancelReply}
                className="composer-clear"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={sendPost}
                disabled={!message.trim()}
                className="composer-post"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      );
}

export default QThread;