// React
import React, { useEffect, useState } from 'react';

// Firebase
import { db }from '../../../firebase'
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';

// Components
import QReplyCard from './qReplyCard';

interface ReplyThreadProps {
    reply: any;
    questionId: string;
    onReply: (commentId: string, username: string) => void;
}

const ReplyThread: React.FC<ReplyThreadProps> = ({ reply, questionId, onReply }) => {
    const [nestedReplies, setNestedReplies] = useState<any[]>([]);
    const [showNested, setShowNested] = useState(false);

    useEffect(() => {
        const fetchNestedReplies = async () => {
            const q = query(
                collection(db, 'certchamps-questions', questionId, 'replies', reply.id, 'replies'),
                orderBy('timestamp', 'asc')
            );

            const unsubscribe = onSnapshot(q, async (snapshot) => {
                const nestedData = await Promise.all(
                    snapshot.docs.map(async (docSnap) => {
                        const nestedReply = docSnap.data();
                        const userId = nestedReply.userId;

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

                        return {
                            id: docSnap.id,
                            content: nestedReply.content,
                            timestamp: nestedReply.timestamp,
                            username,
                            userImage,
                            replyingTo: nestedReply.replyingTo,
                            replyingToUser: nestedReply.replyingToUser,
                        };
                    })
                );
                setNestedReplies(nestedData);
                if (nestedData.length > 0) {
                    setShowNested(true);
                }
            });

            return () => unsubscribe();
        };

        fetchNestedReplies();
    }, [reply.id, questionId]);

    return (
        <div>
            <QReplyCard
                content={reply.content}
                userImage={reply.userImage}
                username={reply.username}
                time={reply.timestamp}
                replyCount={nestedReplies.length}
                onPressReply={() => onReply(reply.id, reply.username)}
                onPressReplies={nestedReplies.length > 0 ? () => setShowNested(!showNested) : undefined}
            />
            
            {showNested && nestedReplies.length > 0 && (
                <div className="ml-6 pl-4 border-l-2 border-light-grey dark:border-grey space-y-3">
                    {nestedReplies.map((nestedReply) => (
                        <div key={nestedReply.id}>
                            <QReplyCard
                                content={nestedReply.content}
                                userImage={nestedReply.userImage}
                                username={nestedReply.username}
                                time={nestedReply.timestamp}
                                replyCount={0}
                                onPressReply={undefined} // Remove reply button for nested replies
                                onPressReplies={undefined} // Remove replies button for nested replies
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


export default ReplyThread;