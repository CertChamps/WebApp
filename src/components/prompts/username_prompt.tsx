import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../context/UserContext";
import { doc, setDoc} from 'firebase/firestore';
import { db } from '../../../firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { LuPen } from "react-icons/lu";
import Cropper from "react-easy-crop";
import Rank1 from "../../assets/Rank2-CCOkr3g2.png"
import { useTutorialContext } from "../../context/TutorialContext";

export default function UsernamePrompt() {
    const { user, setUser } = useContext(UserContext); 
    const [showPrompt, setShowPrompt] = useState<boolean>(false); 
    const [newUsername, setNewUsername] = useState<string>(''); 
    const [error, setError] = useState<string>(''); 
    
    // Cropping states
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [showCropper, setShowCropper] = useState(false);
    const [croppedAvatarUrl, setCroppedAvatarUrl] = useState<string>('');

    const {showTutorial} = useTutorialContext();

    useEffect(() => {
        
        if(user?.username?.length < 1 && !showTutorial) 
            setShowPrompt(true); 
        else 
            setShowPrompt(false); 
    }, [user, showTutorial])
    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setShowCropper(true);
        }
    };

    const getCroppedImg = async (imageSrc: string, crop: any) => {
        const image = new Image();
        image.src = imageSrc;
        await new Promise((resolve) => (image.onload = resolve));
      
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
      
        if (!ctx) return null;
      
        canvas.width = crop.width;
        canvas.height = crop.height;
      
        ctx.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height
        );
      
        return new Promise<Blob | null>((resolve) => {
          canvas.toBlob((blob) => {
            resolve(blob);
          }, "image/jpeg");
        });
    };

    const handleCropComplete = async () => {
        if (!previewUrl || !croppedAreaPixels) return;
      
        const croppedBlob = await getCroppedImg(previewUrl, croppedAreaPixels);
        if (!croppedBlob) return;
      
        // Create a preview URL for the cropped image
        const croppedUrl = URL.createObjectURL(croppedBlob);
        setCroppedAvatarUrl(croppedUrl);
        
        setShowCropper(false);
        setPreviewUrl(null);
    };

    const updateUsername = async () => {
        try {
            const username = newUsername?.trim();

            if ( username?.length > 0 && username.length <= 20 ) {
                
                let avatarURL = user.picture;

                // Upload avatar if one was selected and cropped
                if (selectedFile && croppedAreaPixels) {
                    const croppedBlob = await getCroppedImg(croppedAvatarUrl || previewUrl!, croppedAreaPixels);
                    if (croppedBlob) {
                        const storage = getStorage();
                        const path = `profile-photos/${user.uid}.jpg`;
                        const storageRef = ref(storage, path);
                        
                        await uploadBytes(storageRef, croppedBlob);
                        avatarURL = await getDownloadURL(storageRef);
                    }
                }

                // Update context 
                setUser({...user, username: username, picture: avatarURL})
                
                // Update firebase 
                await setDoc(doc(db, 'user-data', user.uid), {
                    username: username, 
                    picture: avatarURL
                }, {merge: true})

                // Reset all state 
                setNewUsername("");
                setSelectedFile(null);
                setPreviewUrl(null);
                setCroppedAvatarUrl('');
                setCroppedAreaPixels(null);
                setError('');
                setShowPrompt(false);
            }
            else if (username.length > 20) {
                setError('username must be less than 20 characters');
            }
            else {
                setError('please input a valid name');
            }

        }
        catch (err) {
            console.log(err)
        }
  
    }

    return (
        <>
        {/* Image Cropper Modal */}
        {showCropper && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[150]">
                <div className="color-bg p-4 rounded-lg">
                    <div className="relative w-[300px] h-[300px]">
                        <Cropper
                            image={previewUrl!}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                        />
                    </div>
                    <div className="flex justify-between mt-4">
                        <button className="px-4 py-2 color-bg-grey-5 rounded-out" onClick={() => setShowCropper(false)}>Cancel</button>
                        <button className="px-4 py-2 bg-blue-500 text-white rounded-out" onClick={handleCropComplete}>Save</button>
                    </div>
                </div>
            </div>
        )}

        {/* Username Prompt */}
        <div className={`absolute w-screen h-screen top-0 left-0 right-0 bottom-0 flex justify-center items-center
            color-bg-grey-10 transition-opacity duration-300 z-100 ${showPrompt ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className={`w-[30%] h-[70%] color-bg border-2 color-shadow rounded-out p-4
                    transition-transform duration-300 flex flex-col justify-center items-center
                    ${showPrompt ? 'scale-100' : 'scale-95'}`}>
                        <p className="txt-heading-colour text-3xl text-center w-full my-2">Let's set up your profile!</p>
                        <p className="txt  font-semibold color-txt-sub text-center txt-xl w-full mb-2">Choose a username and avatar</p>
                        
                        {/* Avatar Preview */}
                        <div className="flex justify-center mb-4">
                            <div className="relative">
                                <img 
                                    src={croppedAvatarUrl || user?.picture || Rank1}
                                    className="h-32 w-32 rounded-full object-cover border-2 color-shadow"
                                />
                                <button 
                                    className="absolute bottom-0 right-0 color-bg border-1 color-shadow rounded-full p-2 cursor-pointer"
                                    onClick={() => document.getElementById("avatarInput")?.click()}
                                >
                                    <LuPen className="text-xl color-txt-accent" fill="currentColor"/>
                                </button>
                                <input
                                    id="avatarInput"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                            </div>
                        </div>

              
                        <p className="txt color-txt-accent w-full text-center">{error}</p>
                        <input 
                            className="txtbox mx-auto my-2"
                            placeholder="New Username"
                            value={newUsername}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    updateUsername();
                                }
                            }}
                            onChange={(e) => setNewUsername(e.target.value)}/>
                        <div className="blue-btn mx-auto text-center"
                            onClick={() => {updateUsername()}}
                            >Looks good!</div>
                </div>
        </div>
        </>
    )

} 