// Hooks 
import { useContext } from "react"
import { useNavigate } from "react-router-dom";

// Firebase Auth
import { auth } from "../../firebase";

// Contexts
import { OptionsContext } from "../context/OptionsContext"

// Styles & Icons
import { LuArrowLeft } from "react-icons/lu";
import '../styles/settings.css'

export default function Settings() {

    const { setOptions } = useContext(OptionsContext)
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
        <div className="">        

        {/* ====================================== HEADING ========================================= */}
        <div>
            <LuArrowLeft />
            <h1>Settings</h1>
        </div>
        {/* ======================================================================================== */}
        

        <div className="w-h-container background-white flex-col">
            <p className="color-black">Pick a theme</p>
            <span className="cursor-target bg-white text-black theme-button" 
                onClick={() => setTheme('light')}>
                Light</span>
            <span className="cursor-target bg-black text-white theme-button " 
                onClick={() => setTheme('dark')}>
                Dark</span>
            <span className="cursor-target bg-markoteal text-markored theme-button" 
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

        
        </div>
    )
}