import { useContext, useEffect, useState } from 'react'
import { UserContext } from '../context/UserContext'
import { useNavigate, useLocation } from "react-router-dom";
import '../styles/navbar.css'

// ======================= ICON IMPORTS ======================== // 
import { LuPencil, LuSettings, LuUsers, LuChartSpline, LuFilePlus } from "react-icons/lu";
import { TbCards } from 'react-icons/tb';

export default function Navbar () {

    // Icon Properties
    const iconSize = 32
    const strokewidth = 2

    // Context and State and Hooks
    const { user } = useContext(UserContext)
    const navigate = useNavigate()
    const location = useLocation()

    const derivePageFromPath = (path: string) => {
        if (path.startsWith('/decks')) return 'decks'
        if (path.startsWith('/social')) return 'social/social'
        if (path.startsWith('/progress')) return 'progress'
        if (path.startsWith('/user/settings')) return 'user/settings'
        if (path.startsWith('/admin/add-questions')) return 'admin/add-questions'
        if (path.startsWith('/games')) return 'games'
        if (path.startsWith('/practice')) return 'practice'
        if (path.startsWith('/post')) return 'social/social'
        if (path.startsWith('/viewProfile')) return 'viewProfile'
        return 'practice'
    }

    const [page, setPage ]= useState<string>(() => derivePageFromPath(location.pathname))

    // ============================ NAVIGATING BETWEEN PAGES ===================================== //
    const pageNaviagte = (page: string) => {

        // set page state
        setPage(page)

        // navigate to that page
        navigate(`/${page}`) 
        
    } 

    useEffect(() => {
        setPage(derivePageFromPath(location.pathname))
    }, [location.pathname])

    return (
        <div className="container group" >

            {/* ============================= USER CARD ================================ */}
            <div className='user-container'>
                <img src={user.picture} className='user-img' onClick={()=>{
                    navigate(`/viewProfile/${user.uid}`)
                }}/>

                <div className='user-info '>
                    <p className='nav-txt !txt-heading-colour !color-txt-accent' >{user.username}</p>
                    {/* <p className='nav-txt !txt-sub !color-txt-sub text-nowrap' >Rank: {user.rank}</p>  */}
                </div>
            </div>

            {/* ============================= PRACTICE ICON ================================ */}
            <div className={page == 'practice' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('practice')}} >
                <LuPencil strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'practice' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'practice' ? 'currentColor' : 'none'} />
                <p className={page == 'practice' ? 'nav-txt-selected' : 'nav-txt'} >Practice</p>
            </div>
            
            {/* ============================= SOCIAL ICON ================================ */}
            <div className={page == 'social/social' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('social/social')}}> 
                <LuUsers strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'social/social' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'social/social' ? 'currentColor' : 'none'} />  
                <p className={page == 'social/social' ? 'nav-txt-selected' : 'nav-txt'} >Social</p>
            </div>

            <div className={page == 'progress' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('progress')}}>
                <LuChartSpline strokeWidth={strokewidth} size={iconSize}
                    className={page == 'progress' ? 'nav-icon-selected' : 'nav-icon'}
                    fill="none" />
                <p className={page == 'progress' ? 'nav-txt-selected' : 'nav-txt'}>Progress</p>
            </div>
            

            {/* ============================= DECKS ICON ================================ */}
            <div className={page == 'decks' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('decks')}}> 
                <TbCards strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'decks' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'decks' ? 'currentColor' : 'none'} />  
                <p className={page == 'decks' ? 'nav-txt-selected' : 'nav-txt'} >Decks</p>
            </div>

            {/* ============================= GAMES ICON ================================ */}
            {/* <div className={page == 'games' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('games')}}> 
                <LuGamepad2 strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'games' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'games' ? 'currentColor' : 'none'} />  
                <p className={page == 'games' ? 'nav-txt-selected' : 'nav-txt'} >Games</p>
            </div> */}

            {/* ============================= ADD QUESTIONS (ADMIN ONLY) ================================ */}
            {(user.uid === "NkN9UBqoPEYpE21MC89fipLn0SP2" || user.uid === "gJIqKYlc1OdXUQGZQkR4IzfCIoL2") && (
                <div className={page == 'admin/add-questions' ? 'nav-settings-selected' : 'nav-settings'} onClick={() => {pageNaviagte('admin/add-questions')}}> 
                    <LuFilePlus strokeWidth={strokewidth} size={iconSize} 
                        className={page == 'admin/add-questions' ? 'nav-icon-selected' : 'nav-icon'}
                        fill={page == 'admin/add-questions' ? 'currentColor' : 'none'} />  
                    <p className={page == 'admin/add-questions' ? 'nav-txt-selected' : 'nav-txt'} >Add Q's</p>
                </div>
            )}
            
            <div className={page == 'user/settings' ? (user.uid === "NkN9UBqoPEYpE21MC89fipLn0SP2" || user.uid === "gJIqKYlc1OdXUQGZQkR4IzfCIoL2" ? 'nav-bottom-selected' : 'nav-settings-selected') : (user.uid === "NkN9UBqoPEYpE21MC89fipLn0SP2" || user.uid === "gJIqKYlc1OdXUQGZQkR4IzfCIoL2" ? 'nav-bottom' : 'nav-settings')} onClick={() => {pageNaviagte('user/settings')}}> 
                <LuSettings strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'user/settings' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'user/settings' ? 'currentColor' : 'none'} />  
                <p className={page == 'user/settings' ? 'nav-txt-selected' : 'nav-txt'} >Settings</p>
            </div>
        </div>
    )
}