import { getStorage, ref, getDownloadURL } from "firebase/storage";

export default function useFetch () {

    // Initalise Storage
    const storage = getStorage()

    // ============================ FIREBASE STORAGE GET IMAGE FROM PATH ==================== //
    const fetchImage = async (path: string) => {

        // retrieve the image and return a useable url 
        const imageUrl = await getDownloadURL( ref(storage, path) )
        return imageUrl

    }
    // ====================================================================================== //

    

    return { fetchImage }

}