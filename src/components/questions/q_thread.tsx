// React
import react, { useState, useContext, useEffect } from 'react';

// Firebase
import { db }from '../../../firebase'
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';

// Hooks
import { UserContext } from '../../context/UserContext';

// Components
import QReplyCard from './qReplyCard';
import SubReplies from './SubReplies';



type questionType = {
    questionId: string
}



const QThread = (props: questionType) => {

    const { user, setUser } = useContext(UserContext);
    const [ message, setMessage ] = useState('');
    const [ imageURL, setImageURL ] = useState('');
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
        try {
            const docRef = doc(db, "certchamps-questions", props.questionId);
            const docSnap = await getDoc(docRef);
    
            if (docSnap.exists()) {
                const image = docSnap.data().image;
                console.log(image);
                return image; // Return the image URL
            } else {
                console.log("Document doesn't exist!");
                return ''; // Return an empty string if the document doesn't exist
            }
        } catch (error) {
            console.error('Error fetching document:', error);
            return ''; // Return an empty string in case of an error
        }
    };
    //=========================================================================================


    //========================================SEND POST!!!=====================================
    const sendPost = async () => {
        if (!message.trim()) return;
    
        try {
            const image = await getImage(); //Need to get the image as we will put this in the doc
            
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
                console.log('Created social post for practice reply:', practiceReplyDoc.id);
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
          <div className="sticky bottom-0 left-0 border-t border-light-grey dark:border-grey bg-white dark:bg-black p-3 z-10">
            {replyingTo && (
              <div className="flex items-center justify-between mb-2 px-3 py-1 rounded-full bg-light-grey/40 dark:bg-grey/30">
                <span className="txt-sub text-black dark:text-white">
                  Replying to <span className="txt-bold">@{replyingTo.username}</span>
                </span>
                <button
                  onClick={cancelReply}
                  className="txt-sub text-grey dark:text-light-grey hover:text-red"
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
              className="w-full p-3 rounded-xl border-2 border-light-grey dark:border-grey bg-button dark:bg-button-dark text-black dark:text-white focus:outline-none resize-none"
            />
      
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={cancelReply}
                className="px-3 py-1 txt-sub text-grey dark:text-light-grey hover:text-black dark:hover:text-white"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={sendPost}
                disabled={!message.trim()}
                className="px-4 py-2 rounded-xl bg-blue text-white disabled:opacity-50 hover:bg-blue-light"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      );
}

export default QThread;