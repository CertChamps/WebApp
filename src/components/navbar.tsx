import { useContext, useState } from 'react'
import { UserContext } from '../context/UserContext'
import { useNavigate } from "react-router-dom";
import '../styles/navbar.css'

// ======================= ICON IMPORTS ======================== // 
import { LuPencil, LuSettings, LuUsers } from "react-icons/lu";

export default function Navbar () {

    // Icon Properties
    const iconSize = 32
    const strokewidth = 2

    // Context and State and Hooks
    const { user } = useContext(UserContext)
    const [page, setPage ]= useState<string>('practice')
    const navigate = useNavigate()

    // ============================ NAVIGATING BETWEEN PAGES ===================================== //
    const pageNaviagte = (page: string) => {

        // set page state
        setPage(page)

        // navigate to that page
        navigate(`/${page}`) 
        
    } 

    return (
        <div className="container group" >

            {/* ============================= USER CARD ================================ */}
            <div className='user-container'>
                <img src={user.picture} className='user-img' onClick={()=>{
                    navigate(`/viewProfile/${user.uid}`)
                }}/>

                <div className='user-info '>
                    <p className='nav-txt !txt-heading-colour !color-txt-accent' >{user.username}</p>
                    <p className='nav-txt !txt-sub !color-txt-sub text-nowrap' >Rank: {user.rank}</p> 
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

            {/* ============================= GAMES ICON ================================ */}
            {/* <div className={page == 'games' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('games')}}> 
                <LuGamepad2 strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'games' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'games' ? 'currentColor' : 'none'} />  
                <p className={page == 'games' ? 'nav-txt-selected' : 'nav-txt'} >Games</p>
            </div> */}
            
            <div className={page == 'user/settings' ? 'nav-settings-selected' : 'nav-settings'} onClick={() => {pageNaviagte('user/settings')}}> 
                <LuSettings strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'user/settings' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'user/settings' ? 'currentColor' : 'none'} />  
                <p className={page == 'user/settings' ? 'nav-txt-selected' : 'nav-txt'} >Settings</p>
            </div>
        </div>
    )
}