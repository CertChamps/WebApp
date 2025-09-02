import { query, collection, orderBy, onSnapshot, doc, getDoc, getDocs} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import useFetch from "./useFetch";
import useQuestions from "./useQuestions";

export default function usePosts(id: string) {

    // Hooks 
    const { fetchUser } = useFetch()
    const { fetchQuestion } = useQuestions()
    const [replies, setReplies] = useState<any[]>([]);
    const [post, setPost] = useState<any>()

    // =============================== FIREBASE GET ALL USER DECKS ========================== //
    const fetchPost = async (id: any) => {

        try {
            // initialise post Data 
            const postSnap = await getDoc(doc(db, "posts", id));

            let postData = null 

            // Grab the post data 
            if(postSnap.exists())
                postData = postSnap.data();


            // Get reply count
            const repliesSnapshot = await getDocs( postData?.isFlashcard ? collection(db, "certchamps-questions", postData?.flashcardId, "replies") : collection(db, "posts", id, "replies"));
            const replyCount = repliesSnapshot.size

            // Get the flashcard content 
            if ( postData?.isFlashcard ) {

            }

            // Fetch author profile
            const userData = await fetchUser(postData?.userId)

            return({
                ...postData, 
                ...userData,
                replyCount, 
                id: postSnap.id, 
            })
        } 
        catch ( err ) {
            console.log(err)
            return null;
        }

    }
    // ====================================================================================== //

    // ================================= INITIALISE POSTS ================================== // 
    useEffect(() => {

        console.log(id)
        if (!id) return; // return if no id
        const init_post = async () => {
            const postData = await fetchPost(id) 
            setPost(postData)
        }

        init_post()
    }, [id])
    // ==================================================================================== // 

    //============================================= FETCH REPLIES & Post ============================================//
    useEffect(() => {

        if (!post) return; 

        // Query for all replies
        const q = post.flashcardId ? 
        query(collection(db, "certchamps-questions", post.flashcardId, "replies"),orderBy("timestamp", "desc")) : // flashcard 
        query(collection(db, "posts", id, "replies"),orderBy("timestamp", "desc"))   // non-flashcard

        // ============= Add an event listener for new replies =============== //
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            console.log(snapshot.size)
            const replyData = await Promise.all(

                snapshot.docs.map(async (docSnap) => {

                    try {
                        // Get reply data 
                        const reply = docSnap.data();

                        console.log("yo", reply)
                        // Get user data 
                        const userData = await fetchUser(reply.userId)

                        // Get nested replies
                        const nestedReplies = await fetchNestedReplies(docSnap.id)

                        return {
                            ...reply,
                            ...userData,
                            nestedReplies: nestedReplies, 
                            id: docSnap.id,
                        };
                    }
                    catch (err) {
                        console.log(err)
                        return null; 
                    }

                })
            );

            setReplies(replyData)

        });
        // ============================================================= // 

        return () => unsubscribe();

    }, [post]);
    //=========================================================================================================//

    //============================================ GET NESTED REPLIES  ========================================//
    const fetchNestedReplies = async (replyId: string ) => {

        // Query for all replies
        const snapshot = post.flashcardId ? 
        await getDocs(query(collection(db, "certchamps-questions", post.flashcardId, "replies", replyId, "replies"), orderBy("timestamp", "desc"))) : // flashcard 
        await getDocs(query(collection(db, "posts", id, "replies", replyId, "replies"), orderBy("timestamp", "desc")))   // non-flashcard

        const replyData = await Promise.all(

            snapshot.docs.map(async (docSnap) => {

                try {
                    // Get reply data 
                    const reply = docSnap.data();

                    // Get user data 
                    const userData = await fetchUser(reply.userId)

                    return {
                        ...reply,
                        ...userData,
                        id: docSnap.id,
                    };
                }
                catch (err) {
                    console.log(err)
                    return null; 
                }

            })

        );

     return replyData 
    }
    //=========================================================================================================//


    return {post, replies}
}