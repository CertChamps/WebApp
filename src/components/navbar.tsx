import { useContext, useEffect, useState } from 'react'
import { UserContext } from '../context/UserContext'
import { isAdminUid } from '../constants/adminUids'
import { useNavigate, useLocation } from "react-router-dom";
import '../styles/navbar.css'

// ======================= ICON IMPORTS ======================== // 
import { LuPencil, LuSettings, LuUsers, LuChartSpline, LuFilePlus, LuMessageSquareText } from "react-icons/lu";
import { TbCards } from 'react-icons/tb';
import type { IconType } from 'react-icons';

export default function Navbar () {

    // Icon Properties
    const iconSize = 18
    const strokewidth = 2

    // Context and State and Hooks
    const { user } = useContext(UserContext)
    const isAdmin = isAdminUid(user?.uid)
    const navigate = useNavigate()
    const location = useLocation()

    const derivePageFromPath = (path: string) => {
        if (path.startsWith('/decks')) return 'decks'
        if (path.startsWith('/social')) return 'social/social'
        if (path.startsWith('/progress')) return 'progress'
        if (path.startsWith('/feedback')) return 'feedback'
        if (path.startsWith('/user/settings')) return 'user/settings'
        if (path.startsWith('/admin/add-questions')) return 'admin/add-questions'
        if (path.startsWith('/admin/canvas-viewer')) return 'admin/canvas-viewer'
        if (path.startsWith('/games')) return 'games'
        if (path.startsWith('/practice')) return 'practice'
        if (path.startsWith('/post')) return 'social/social'
        if (path.startsWith('/viewProfile')) return 'viewProfile'
        return 'practice'
    }

    const [page, setPage ]= useState<string>(() => derivePageFromPath(location.pathname))

    const navigateToPractice = () => {
        try {
            const savedSearch = localStorage.getItem("questions-page-resume-search");
            if (savedSearch && savedSearch.trim().length > 0) {
                navigate(`/practice/session?${savedSearch}`);
                return;
            }
        } catch {
            return navigate("/practice");
        }
        navigate("/practice");
    };

    // ============================ NAVIGATING BETWEEN PAGES ===================================== //
    const pageNaviagte = (page: string) => {

        // set page state
        setPage(page)

        // navigate to that page
        if (page === "practice") {
            navigateToPractice();
            return;
        }
        navigate(`/${page}`) 
        
    } 

    useEffect(() => {
        setPage(derivePageFromPath(location.pathname))
    }, [location.pathname])

    const renderNavItem = (
        key: string,
        label: string,
        Icon: IconType,
        targetPage: string,
        isBottom = false,
    ) => {
        const isSelected = page === targetPage
        const baseClass = isBottom ? 'nav-bottom' : 'nav-item'
        const selectedClass = isBottom ? 'nav-bottom-selected' : 'nav-item-selected'

        return (
            <button
                key={key}
                type="button"
                data-tutorial-id={key}
                className={isSelected ? selectedClass : baseClass}
                onClick={() => {pageNaviagte(targetPage)}}
                aria-label={label}
            >
                <Icon
                    strokeWidth={strokewidth}
                    size={iconSize}
                    className={isSelected ? 'nav-icon-selected' : 'nav-icon'}
                    fill={isSelected ? 'currentColor' : 'none'}
                />
                <span className="nav-tooltip" role="tooltip">
                    <span className="nav-tooltip-txt">{label}</span>
                </span>
            </button>
        )
    }

    return (
        <div id="app-navbar" className="container" >

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
            {renderNavItem('nav-practice', 'Practice', LuPencil, 'practice')}
            
            {/* ============================= SOCIAL ICON ================================ */} 
            {renderNavItem('nav-social', 'Social', LuUsers, 'social/social')}

            {renderNavItem('nav-progress', 'Progress', LuChartSpline, 'progress')}
            

            {/* ============================= DECKS ICON ================================ */}
            {renderNavItem('nav-decks', 'Decks', TbCards, 'decks')}

            {/* ============================= GAMES ICON ================================ */}
            {/* <div className={page == 'games' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('games')}}> 
                <LuGamepad2 strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'games' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'games' ? 'currentColor' : 'none'} />  
                <p className={page == 'games' ? 'nav-txt-selected' : 'nav-txt'} >Games</p>
            </div> */}

            {/* ============================= FEEDBACK ICON ================================ */}
            {renderNavItem('nav-feedback', 'Feedback', LuMessageSquareText, 'feedback')}

            <div className="mt-auto w-full flex flex-col items-center">
                {/* ============================= ADD QUESTIONS (ADMIN ONLY) ================================ */}
                {isAdmin && (
                    renderNavItem('nav-add-questions', "Add Q's", LuFilePlus, 'admin/add-questions', true)
                )}

                {isAdmin && (
                    renderNavItem('nav-canvas-viewer', 'Users', LuUsers, 'admin/canvas-viewer', true)
                )}
                
                {renderNavItem('nav-settings', 'Settings', LuSettings, 'user/settings', true)}
            </div>
        </div>
    )
}