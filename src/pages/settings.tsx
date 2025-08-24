import { useContext } from "react"
import { OptionsContext } from "../context/OptionsContext"
import '../styles/settings.css'

export default function Settings() {

    const { setOptions } = useContext(OptionsContext)

    const setTheme = (theme: string) => {
        setOptions(( opts : any ) => ({
            ...opts,
            theme
        }))
    }
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

        </div>
        </div>
    )
}