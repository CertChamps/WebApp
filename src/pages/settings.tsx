// Hooks 
import { useContext } from "react"
import { useNavigate } from "react-router-dom";

// Firebase Auth
import { auth } from "../../firebase";

// Contexts
import { OptionsContext } from "../context/OptionsContext"
import { UserContext } from "../context/UserContext";

// Tutorial
import { useTutorialContext } from "../context/TutorialContext";
import { TutorialTriggerButton } from "../components/tutorial/Tutorial";

// Styles & Icons
import { LuLogOut, LuRotateCcw, LuUserCog } from "react-icons/lu";
import '../styles/settings.css'

export default function Settings() {

    const { options, setOptions } = useContext(OptionsContext)
    const { user, setUser } = useContext(UserContext)
    const navigate = useNavigate()
    
    // Tutorial context
    const { triggerTutorial, resetTutorial, hasCompletedTutorial } = useTutorialContext();

    const setTheme = (theme: string) => {
        setOptions(( opts : any ) => ({
            ...opts,
            theme
        }))
    }

    // ======================================== EXISTING USERS ======================================= //
    const logOut = async () => {
        await auth.signOut()
        localStorage.setItem("USER", "")
        setUser(null)
        navigate('/')
    }
    // =============================================================================================== //


    return (
        <div className="p-4 w-full h-full overflow-y-scroll scrollbar-minimal">        

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
            <img
                src={user?.picture}
                alt="User Avatar"
                className="avatar-img"
            />
            <h1 className="avatar-username">{user?.username}</h1>
        </div>

        <span className="cursor-target color-bg-accent txt-heading-colour px-4 py-2 rounded-out mb-2 hover:scale-95 duration-200
            mx-6 cursor-pointer transition-all" 
                onClick={() => navigate('/user/manage-account')}>
                <span className="font-bold">Manage Account</span>
                <LuUserCog className="txt-heading-colour inline mx-1.5" strokeWidth={3}/>
        </span>

        <span className="cursor-target color-bg-accent txt-heading-colour px-4 py-2 rounded-out mb-2 hover:scale-95 duration-200
            mx-6 cursor-pointer transition-all" 
                onClick={() => {logOut()}}>
                <span className="font-bold">Log Out</span>
                <LuLogOut className="txt-heading-colour inline mx-1" strokeWidth={3}/>
        </span> 

        {/* ====================================== QUESTION SETTINGS ========================================= */}
        {/* <div className="flex w-full items-center mt-6">
            <h1 className="profile-heading">Question Settings</h1>
            <div className="line-break"></div>
        </div> */}

        {/* <div className="mx-6 my-4 max-w-md">
            
            <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full color-bg-grey-5 flex items-center justify-center">
                        <LuPencil size={20} className="color-txt-sub" />
                    </div>
                    <div>
                        <p className="txt-bold">Drawing Canvas</p>
                        <p className="txt-sub">Draw notes on questions with touch or mouse</p>
                    </div>
                </div>
                <button
                    className={`w-14 h-8 rounded-full transition-all duration-200 relative ${
                        options.drawingEnabled !== false 
                            ? 'color-bg-accent' 
                            : 'color-bg-grey-5'
                    }`}
                    onClick={() => setOptions((opts: any) => ({
                        ...opts,
                        drawingEnabled: opts.drawingEnabled === false ? true : false
                    }))}
                >
                    <div 
                        className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-200 ${
                            options.drawingEnabled !== false ? 'right-1' : 'left-1'
                        }`}
                    />
                </button>
            </div>
        </div> */}
        {/* ======================================================================================== */}

        {/* ====================================== PRACTICE LAYOUT ========================================= */}
        <div className="flex w-full items-center mt-6">
            <h1 className="profile-heading">Practice</h1>
            <div className="line-break"></div>
        </div>
        <div className="mx-6 my-4 max-w-md">
            <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full color-bg-grey-5 flex items-center justify-center">
                        <LuRotateCcw size={20} className="color-txt-sub" style={{ transform: "scaleX(-1)" }} />
                    </div>
                    <div>
                        <p className="txt-bold">Left-hand layout</p>
                        <p className="txt-sub">Flip the practice tab: sidebar and question list on the left</p>
                    </div>
                </div>
                <button
                    className={`w-14 h-8 rounded-full transition-all duration-200 relative ${
                        options.leftHandMode ? "color-bg-accent" : "color-bg-grey-5"
                    }`}
                    onClick={() => setOptions((opts: any) => ({
                        ...opts,
                        leftHandMode: !opts.leftHandMode
                    }))}
                >
                    <div
                        className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-200 ${
                            options.leftHandMode ? "right-1" : "left-1"
                        }`}
                    />
                </button>
            </div>
        </div>
        {/* ======================================================================================== */}

        {/* ====================================== HELP & TUTORIAL ========================================= */}
        <div className="flex w-full items-center mt-6">
            <h1 className="profile-heading">Help & Tutorial</h1>
            <div className="line-break"></div>
        </div>

        <div className="mx-6 my-4 max-w-md">
            <TutorialTriggerButton onClick={triggerTutorial} />
            
            {/* Admin option to reset tutorial */}
            {user?.isAdmin && (
                <button 
                    className="flex items-center gap-2 mt-3 px-4 py-2 text-sm color-txt-sub 
                               hover:color-txt-accent transition-colors cursor-pointer"
                    onClick={async () => {
                        await resetTutorial();
                        triggerTutorial();
                    }}
                >
                    <LuRotateCcw size={16} />
                    <span>Reset & Replay Tutorial (Admin)</span>
                </button>
            )}
            
            {/* Show tutorial status for debugging/admin */}
            {user?.isAdmin && (
                <p className="text-xs color-txt-sub mt-2">
                    Tutorial completed: {hasCompletedTutorial ? 'Yes' : 'No'}
                </p>
            )}
        </div>
        {/* ======================================================================================== */}

   

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
                onClick={() => setTheme('nordLight')}>
                <p className="theme-text">Nord Light</p>
                <div className="color-strip-container bg-nordLightBG " >
                    <div className="color-strip-item bg-nordLightPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-nordLightSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-nordLightAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('nordDark')}>
                <p className="theme-text">Nord Dark</p>
                <div className="color-strip-container bg-nordDarkBG " >
                    <div className="color-strip-item bg-nordDarkPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-nordDarkSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-nordDarkAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('modernInk')}>
                <p className="theme-text">Modern Ink</p>
                <div className="color-strip-container bg-modernInkBG " >
                    <div className="color-strip-item bg-modernInkPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-modernInkSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-modernInkAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('magicGirl')}>
                <p className="theme-text">Magic Girl</p>
                <div className="color-strip-container bg-magicGirlBG " >
                    <div className="color-strip-item bg-magicGirlPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-magicGirlSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-magicGirlAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('lavendar')}>
                <p className="theme-text">Lavendar</p>
                <div className="color-strip-container bg-lavendarBG " >
                    <div className="color-strip-item bg-lavendarPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-lavendarSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-lavendarAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container"
                onClick={() => setTheme('airplane')}>
                <p className="theme-text">Airplane</p>
                <div className="color-strip-container bg-airplaneBG " >
                    <div className="color-strip-item bg-airplanePrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-airplaneSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-airplaneAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container"
                onClick={() => setTheme('sewingTinLight')}>
                <p className="theme-text">Sewing Tin Light</p>
                <div className="color-strip-container bg-sewingTinLightBG " >
                    <div className="color-strip-item bg-sewingTinLightPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-sewingTinLightSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-sewingTinLightAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container"
                onClick={() => setTheme('camping')}>
                <p className="theme-text">Camping</p>
                <div className="color-strip-container bg-campingBG " >
                    <div className="color-strip-item bg-campingPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-campingSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-campingAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container"
                onClick={() => setTheme('paper')}>
                <p className="theme-text">Paper</p>
                <div className="color-strip-container bg-paperBG " >
                    <div className="color-strip-item bg-paperPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-paperSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-paperAccent " > </div> {/* ACCENT */}
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
                onClick={() => setTheme('menthol')}>
                <p className="theme-text">Menthol</p>
                <div className="color-strip-container bg-mentholBG " >
                    <div className="color-strip-item bg-mentholPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-mentholSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-mentholAccent " > </div> {/* ACCENT */}
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
                onClick={() => setTheme('aurora')}>
                <p className="theme-text">Aurora</p>
                <div className="color-strip-container bg-auroraBG " >
                    <div className="color-strip-item bg-auroraPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-gradient-to-r from-auroraSub1 to-auroraSub2 " > </div> {/* SUB */}
                    <div className="color-strip-item bg-gradient-to-r from-auroraAccent1 to-auroraAccent2 " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('gruvbox')}>
                <p className="theme-text">Gruvbox</p>
                <div className="color-strip-container bg-gruvboxBG " >
                    <div className="color-strip-item bg-gruvboxPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-gruvboxSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-gruvboxAccent " > </div> {/* ACCENT */}
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
                onClick={() => setTheme('blueberryLight')}>
                <p className="theme-text">Blueberry Light</p>
                <div className="color-strip-container bg-blueberryLightBG " >
                    <div className="color-strip-item bg-blueberryLightPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-blueberryLightSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-blueberryLightAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('blueberryDark')}>
                <p className="theme-text">Blueberry Dark</p>
                <div className="color-strip-container bg-blueberryDarkBG " >
                    <div className="color-strip-item bg-blueberryDarkPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-blueberryDarkSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-blueberryDarkAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('darkFuchsia')}>
                <p className="theme-text">Dark Fuchsia</p>
                <div className="color-strip-container bg-darkFuchsiaBG " >
                    <div className="color-strip-item bg-darkFuchsiaPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-darkFuchsiaSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-darkFuchsiaAccent " > </div> {/* ACCENT */}
                </div>
            </div>

            <div className="cursor-target theme-container" 
                onClick={() => setTheme('pastelPink')}>
                <p className="theme-text">Pastel Pink</p>
                <div className="color-strip-container bg-pastelPinkBG " >
                    <div className="color-strip-item bg-pastelPinkPrimary " > </div> {/* PRIMARY */}
                    <div className="color-strip-item bg-pastelPinkSub " > </div> {/* SUB */}
                    <div className="color-strip-item bg-pastelPinkAccent " > </div> {/* ACCENT */}
                </div>
            </div>
        </div>

            
        

        {/* ======================================================================================== */}
        
        </div>
    )
}