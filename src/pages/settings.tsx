// Hooks 
import { useContext } from "react"
import { useNavigate } from "react-router-dom";

// Firebase Auth
import { auth } from "../../firebase";

// Contexts
import { OptionsContext } from "../context/OptionsContext"
import { UserContext } from "../context/UserContext";


// Styles & Icons
import { LuLogOut } from "react-icons/lu";
import '../styles/settings.css'

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
                <div className="color-strip-container bg-ishtarblack " >
                    <div className="color-strip-item bg-ishtarred " > </div> {/* ACCENT */}
                    <div className="color-strip-item bg-ishtargrey " > </div> {/* SUB */}
                    <div className="color-strip-item bg-ishtarbeige " > </div> {/* TEXT */}
                </div>
            </div>

        </div>

        {/* ======================================================================================== */}
        
        </div>
    )
}