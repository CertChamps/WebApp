import { useContext } from "react"
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import { OptionsContext } from "../context/OptionsContext"
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
        <div className="w-h-container" data-theme="ishtar" >        
        <div className="w-h-container background-white flex-col">
            <p className="color-black">Pick a theme</p>
            <span className=" bg-white text-black theme-button" 
                onClick={() => setTheme('light')}>
                Light</span>
            <span className="bg-black text-white theme-button " 
                onClick={() => setTheme('dark')}>
                Dark</span>
            <span className="bg-markoteal text-markored theme-button" 
                onClick={() => setTheme('markoblank')}>
                Markoblank</span>
            <span className="bg-discordblack text-discordblue theme-button" 
                onClick={() => setTheme('discord')}>
                Discord</span>
            <span className="bg-ishtarblack text-ishtarred theme-button" 
                onClick={() => setTheme('ishtar')}>
                Ishtar</span>
             <span className="color-bg-accent color-txt-main theme-button" 
                onClick={() => {logOut()}}>
                Log Out</span>

        </div>
        </div>
    )
}