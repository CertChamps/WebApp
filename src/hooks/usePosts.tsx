import { deleteDoc, doc } from 'firebase/firestore';
import { db }from '../../firebase'
import { useNavigate } from 'react-router-dom';


export default function usePosts() {

    const navigate = useNavigate();

    //======================== DELETE POST ==============================================//
    const deletePost = async (postID: string) => {
      try{
        const postRef = doc(db, 'posts', postID);
        await deleteDoc(postRef);
        navigate(-1); // Go back to the previous page
      }
      catch(error){
        console.error("Error deleting post: ", error);
      }  
    }
    // ============================================================================================//

    return { deletePost }
}