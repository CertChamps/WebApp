import { LuSearch } from "react-icons/lu"
import { useState, useEffect } from "react"
import useFriends from "../../hooks/useFriends"
import Lottie  from 'lottie-react';
import loadingAnim from '../../assets/animations/loading.json';

export default function FriendsSearch() {

    const { getSearch, sendFriendRequest } = useFriends()
    const [search, setSearch] = useState('')
    const [usersFound, setUsersFound] = useState<any>()
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const runSearch = async () => {
            if (search.length > 0) {
                setLoading(true)
                const result = await getSearch(search)
                setUsersFound(result)
                setLoading(false)
            }
        }

        runSearch()
    }, [search])

    return ( 
        <div>
            {/* ======================================== SEARCH AND FILTER ========================================== */}
            <div className="flex items-center gap-3 w-full color-bg">
                <div className="flex items-center txtbox w-full max-w-xs  color-bg">
                    <input type="text" placeholder="Search Questions" className=" w-full p-1 outline-none border-none"
                        onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setSearch(txt.target.value);}}/>
                    <LuSearch className="color-txt-sub " size={24}/>
                </div>
            </div>
            {/* ===================================================================================================== */}
            {
                !loading ? (
                    usersFound?.length > 0 && search.length > 0 ? (
                    <div>
                    { 
                    usersFound?.map((user: any) => (
                        <div className="m-4">
                        <img 
                            src={user.picture} 
                            alt={user.picture}
                            className="w-10 h-10 rounded-full object-cover inline"
                        />
                        <span className="txt-bold mx-4 inline">{user.username}</span>
                    {

                    <span className="blue-btn cursor-pointer inline" onClick={() => {
                        sendFriendRequest(user.username); setSearch('')
                        }} >Send Request</span>
                        
                    }


                    </div>
                    )) 
                    }
                    </div>
                    ) 
                    : (<span className="txt-heading">No Results</span>)
                ) : (
                <div className="w-full h-full flex justify-center items-center">
                    <Lottie animationData={loadingAnim} loop={true} autoplay={true} 
                        className="h-40 w-40" />
                </div>
                )
            }


        </div>
    )
}