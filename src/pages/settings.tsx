// Hooks 
import { useContext, useState } from "react"
import { useNavigate } from "react-router-dom";

// Firebase Auth
import { auth, db } from "../../firebase";

// Contexts
import { OptionsContext } from "../context/OptionsContext"
import { UserContext } from "../context/UserContext";


// Styles & Icons
import { LuLogOut } from "react-icons/lu";
import '../styles/settings.css'
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import Cropper from "react-easy-crop";

export default function Settings() {

    const { setOptions } = useContext(OptionsContext)
    const { user, setUser } = useContext(UserContext)
    const navigate = useNavigate()

    // These are all just for cropping
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [showCropper, setShowCropper] = useState(false);

    // Username
    const [newUsername, setNewUsername] = useState<string>("");

    const setTheme = (theme: string) => {
        setOptions(( opts : any ) => ({
            ...opts,
            theme
        }))
    }

    // ======================================== EXISTING USERS ======================================= //
    const logOut = async () => {
        await auth.signOut()
        navigate('/')
    }
    // =============================================================================================== //


    //===================== Takes care of file selection ======================
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setShowCropper(true);
        }
    };
    //=========================================================================


    //==================== Handle cropped image ======================
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
    //================================================================


    //====================== Upload the image ========================
    const uploadCroppedImage = async () => {
        if (!previewUrl || !croppedAreaPixels) return;
      
        const croppedBlob = await getCroppedImg(previewUrl, croppedAreaPixels);
        if (!croppedBlob) return;
      
        const storage = getStorage();
        const path = `profile-photos/${user.uid}.jpg`;
        const storageRef = ref(storage, path);
      
        await uploadBytes(storageRef, croppedBlob);
        const downloadURL = await getDownloadURL(storageRef);
      
        // Update Firestore
        const userRef = doc(db, "user-data", user.uid);
        await updateDoc(userRef, { picture: path });
      
        // Update context
        user.picture = downloadURL;
      
        setShowCropper(false);
        setPreviewUrl(null);
    };
    //================================================================


    //========================== Change Username ============================
    const changeUsername = async (newUsername: string) => {
        const username = newUsername.trim();

        setUser({...user, username: username})
        await setDoc(doc(db, 'user-data', user.uid), {username: username}, {merge: true})
        setNewUsername("");
    }
    //=======================================================================


    return (
        <div className="p-4 w-full h-full overflow-y-scroll">        

        {/* ====================================== HEADING ========================================= */}
        <div>
            <h1 className="heading-text">Settings</h1>
        </div>
        {/* ======================================================================================== */}
        
        <div className="flex w-full items-center ">
            <h1 className="profile-heading">Profile</h1>
            <div className="line-break"></div>
        </div>

        <div className="user-info-container">

        <div className="avatar">
            <img 
                src={user?.picture}
                alt="User Avatar"
                className="avatar-img"
            />
            <h1 className="avatar-edit" onClick={() => document.getElementById("fileInput")?.click()}>
                Edit Avatar
            </h1>
            <input
                id="fileInput"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>



        {/* --------------------------This is all just for the image cropper---------------------- */}
        {showCropper && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                <div className="bg-white p-4 rounded-lg">
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
                    <button onClick={() => setShowCropper(false)}>Cancel</button>
                    <button onClick={uploadCroppedImage}>Save</button>
                </div>
                </div>
            </div>
        )}
        {/* -------------------------------------------------------------------------------------- */}



        <div className="flex-1">
            <p className="input-header">Username</p>
            <div className="flex items-center mb-4">
                <input type="text" className="txtbox max-w-md" value={newUsername} onChange={(e) => {setNewUsername(e.target.value)}}/>
                <span className="update-btn" onClick={() => changeUsername(newUsername)}>Update</span>
            </div>

            <p className="input-header">School</p>

            <div className="flex items-center">
                <input type="text" className="txtbox max-w-md " />
                <span
                    className="update-btn"
                    onMouseDown={e => e.currentTarget.classList.add('translate-x-20')}
                    onMouseUp={e => e.currentTarget.classList.remove('translate-x-20')}
                    onMouseLeave={e => e.currentTarget.classList.remove('translate-x-0')}
                >
                    Update
                </span>
            </div>
        </div>

        </div>

        <span className="cursor-target color-bg-accent txt-heading-colour px-4 py-2 rounded-out mb-2 hover:scale-95 duration-200
            mx-6 cursor-pointer transition-all" 
                onClick={() => {logOut()}}>
                <span className="">Log Out</span>
                <LuLogOut className="txt-heading-colour inline mx-1" strokeWidth={3}/>
        </span> 

   

        {/* ====================================== THEMES ========================================= */}
        <div className="flex w-full items-center mt-4">
            <h1 className="profile-heading">Themes</h1>
            <div className="line-break"></div>
        </div>

        <div className="flex flex-wrap max-w-full">

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('light')}>
                <p className="theme-text">Light</p>
                <div className="color-strip-container bg-white" >
                    <div className="color-strip-item bg-blue" > </div> {/* ACCENT */}
                    <div className="color-strip-item bg-black" > </div> {/* SUB */}
                    <div className="color-strip-item bg-grey" > </div> {/* TEXT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('dark')}>
                <p className="theme-text">Dark</p>
                <div className="color-strip-container bg-black" >
                    <div className="color-strip-item bg-blue-light" > </div> {/* ACCENT */}
                    <div className="color-strip-item bg-white" > </div> {/* SUB */}
                    <div className="color-strip-item bg-light-grey" > </div> {/* TEXT */}
                </div>
            </div>
    
            <div className="cursor-target theme-container" 
                onClick={() => setTheme('markoblank')}>
                <p className="theme-text">Markoblank</p>
                <div className="color-strip-container bg-markoteal" >
                    <div className="color-strip-item bg-markored " > </div> {/* ACCENT */}
                    <div className="color-strip-item bg-markobrown " > </div> {/* SUB */}
                    <div className="color-strip-item bg-markogrey " > </div> {/* TEXT */}
                </div>
            </div>


            <div className="cursor-target theme-container" 
                onClick={() => setTheme('discord')}>
                <p className="theme-text">Discord</p>
                <div className="color-strip-container bg-discordblack " >
                    <div className="color-strip-item bg-discordblue " > </div> {/* ACCENT */}
                    <div className="color-strip-item bg-discordwhite " > </div> {/* SUB */}
                    <div className="color-strip-item bg-discordgrey " > </div> {/* TEXT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('ishtar')}>
                <p className="theme-text">Ishtar</p>
                <div className="color-strip-container bg-ishtarblack " >    {/* BG */}
                    <div className="color-strip-item bg-ishtarred " > </div> {/* ACCENT */}
                    <div className="color-strip-item bg-ishtargrey " > </div> {/* SUB */}
                    <div className="color-strip-item bg-ishtarbeige " > </div> {/* TEXT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('tangerine')}>
                <p className="theme-text">Tangerine</p>
                <div className="color-strip-container bg-tangerineBG " >
                    <div className="color-strip-item bg-tangerinePrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-tangerineSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-tangerineAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('icebergLight')}>
                <p className="theme-text">Iceberg Light</p>
                <div className="color-strip-container bg-icebergLightBG " >
                    <div className="color-strip-item bg-icebergLightPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-icebergLightSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-icebergLightAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('icebergDark')}>
                <p className="theme-text">Iceberg Dark</p>
                <div className="color-strip-container bg-icebergDarkBG " >
                    <div className="color-strip-item bg-icebergDarkPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-icebergDarkSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-icebergDarkAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('husqy')}>
                <p className="theme-text">Husqy</p>
                <div className="color-strip-container bg-husqyBG " >
                    <div className="color-strip-item bg-husqyPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-husqySub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-husqyAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('shadow')}>
                <p className="theme-text">Shadow</p>
                <div className="color-strip-container bg-shadowBG " >
                    <div className="color-strip-item bg-shadowPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-shadowSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-shadowAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('matchaMoccha')}>
                <p className="theme-text">Matcha Moccha</p>
                <div className="color-strip-container bg-matchaMocchaBG " >
                    <div className="color-strip-item bg-matchaMocchaPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-matchaMocchaSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-matchaMocchaAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('redDragon')}>
                <p className="theme-text">Red Dragon</p>
                <div className="color-strip-container bg-redDragonBG " >
                    <div className="color-strip-item bg-redDragonPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-redDragonSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-redDragonAccent " > </div> {/* ACCENT */}
                </div>
            </div>

        </div>

        {/* ======================================================================================== */}
        
        </div>
    )
}