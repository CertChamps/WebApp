// Hooks 
import { useContext } from "react"
import { useNavigate } from "react-router-dom";

// Firebase Auth
import { auth } from "../../firebase";

// Contexts
import { OptionsContext } from "../context/OptionsContext"

// Styles & Icons
import '../styles/settings.css'
import { UserContext } from "../context/UserContext";

export default function Settings() {

    const { setOptions } = useContext(OptionsContext)
    const { user } = useContext(UserContext)
    const navigate = useNavigate()

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
    // ================================================================================================= //


    return (
        <div className="p-4 w-full h-full">        

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
                <h1 className="avatar-edit">Edit Avatar</h1>
            </div>

            <div className="flex-1">

                <p className="input-header">Username</p>
                <div className="flex items-center mb-4">
                    <input type="text" className="txtbox max-w-md" />
                    <span className="update-btn">Update</span>
                </div>

                <p className="input-header">School</p>
                <div className="flex items-center">
                    <input type="text" className="txtbox max-w-md" />
                    <span className="update-btn">Update</span>
                </div>
         
         
            </div>

        </div>

   

        {/* ====================================== THEMES ========================================= */}
        <div className="flex w-full items-center ">
            <h1 className="profile-heading">Themes</h1>
            <div className="line-break"></div>
        </div>

        <div className="">
            <div className="cursor-target theme-container" 
                onClick={() => setTheme('light')}>
                <span>Light</span>
                <div className="bg-" ></div>
                <div></div>
                <div></div>
                <div></div>

            </div>
            <span className="cursor-target theme-container" 
                onClick={() => setTheme('dark')}>
                Dark</span>
            <span className="cursor-target bg-markoteal theme-container" 
                onClick={() => setTheme('markoblank')}>
                Markoblank</span>
            <span className="cursor-target bg-discordblack text-discordblue theme-button" 
                onClick={() => setTheme('discord')}>
                Discord</span>
            <span className="cursor-target bg-ishtarblack text-ishtarred theme-button" 
                onClick={() => setTheme('ishtar')}>
                Ishtar</span>
             <span className="cursor-target color-bg-accent color-txt-main theme-button" 
                onClick={() => {logOut()}}>
                Log Out</span> 
        </div>

        {/* ======================================================================================== */}
        
        </div>
    )
}