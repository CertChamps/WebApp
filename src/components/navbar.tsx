import { useContext, useState } from 'react'
import { UserContext } from '../context/UserContext'
import { useNavigate } from "react-router-dom";

// ======================= ICON IMPORTS ======================== // 
import { LuPencil, LuSettings, LuUsers, LuGamepad2 } from "react-icons/lu";


export default function Navbar () {

    // Icon Properties
    const iconSize = 36
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
        <div className="h-full flex flex-col p-4 group transition-all duration-250 bg-light-grey/5 dark:bg-grey/5" >

            {/* ============================= USER CARD ================================ */}
            <div className='flex items-center justify-evenly rounded-out h-16 group-hover:bg-opaque p-2 mb-2'>
                <img src={user.picture} className='rounded-full border-light-grey border-2 w-7 group-hover:w-9 transition-all duration-250' />

                <div className='transition-all duration-250 group-hover:ml-2'>
                    <p className='nav-txt txt-heading-colour text-blue dark:text-blue-light' >{user.username}</p>
                    <p className='nav-txt txt-sub text-nowrap' >Rank: Elite</p> 
                </div>
                <LuSettings className='nav-txt group-hover:w-8 text-grey dark:text-grey-light' size={24}/>
            </div>

            {/* ============================= PRACTICE ICON ================================ */}
            <div className={page == 'practice' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('practice')}} >
                <LuPencil strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'practice' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'practice' ? 'currentColor' : 'none'} />
                <p className={page == 'practice' ? 'nav-txt-selected' : 'nav-txt'} >Practice</p>
            </div>
            
            {/* ============================= SOCIAL ICON ================================ */}
            <div className={page == 'social' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('social')}}> 
                <LuUsers strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'social' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'social' ? 'currentColor' : 'none'} />  
                <p className={page == 'social' ? 'nav-txt-selected' : 'nav-txt'} >Social</p>
            </div>

            {/* ============================= GAMES ICON ================================ */}
            <div className={page == 'games' ? 'nav-item-selected' : 'nav-item'} onClick={() => {pageNaviagte('games')}}> 
                <LuGamepad2 strokeWidth={strokewidth} size={iconSize} 
                    className={page == 'games' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={page == 'games' ? 'currentColor' : 'none'} />  
                <p className={page == 'games' ? 'nav-txt-selected' : 'nav-txt'} >Games</p>
            </div>
            
        </div>
    )
}