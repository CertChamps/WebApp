import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import Lottie  from 'lottie-react';
import loadingAnim from '../assets/animations/loading.json';
import useFetch from "../hooks/useFetch"

export default function ProfileViewer() {

    const {userID} = useParams()
    const navigate = useNavigate()
    const [ user, setUser ] = useState<any>()
    const [ friends, setFriends ] = useState<any>()
    const [ decks, setDecks ] = useState<any>()
    const { fetchFriends, fetchUser, fetchDecks } = useFetch()

    useEffect(() => {
        const fetchInfo = async () => {
            const usr = await fetchUser(userID)
            const frnds = await fetchFriends(userID)
            const dcks = await fetchDecks(userID)
            console.log(usr)

            setUser(usr)
            setFriends(frnds)
            setDecks(dcks)
        }

        fetchInfo()
    }, [])

    return (
    <div className="w-h-container justify-start items-start p-8">
        {
            user ? (
            <div>
                <div>
                    <img 
                        src={user.picture} 
                        className="w-10 h-10 rounded-full inline object-cover border-2 border-light-grey dark:border-grey"
                    />
                    <span className="txt-heading-colour mx-4">{user.username}</span>
                        <span className="txt-sub mx-4 inline">{user.email}</span>
                </div>
                <div>
                    <p className="txt-heading">User Friends</p>
                    {
                    friends?.map((friend: any) => (
                    <div className="m-2">
                        <img 
                            src={friend.picture} 
                            alt={friend.picture}
                            className="w-10 h-10 rounded-full object-cover inline"
                        />
                        <span className="txt-bold mx-4 inline">{friend.username}</span>
                    
                    </div>
                    ))
                    }
                    <p className="txt-heading">User Decks</p>
                    {
                    decks?.map( (deck: any) => (
                        <div key={deck.id} className="deck" onClick={() => {navigate(`/decks/${user.uid}/${deck.id}`)}}>
                            <div className={`color-strip`} style={{backgroundColor: deck.color}} ></div>
                            <div className="deck-txt">
                                <span className="txt-heading-colour">{deck.name}</span>
                                <span className="txt-sub">{deck.timestamp ? new Date(deck.timestamp.seconds * 1000).toLocaleDateString() : ''}</span>
                            </div>
                            <div className="deck-txt">
                                <span className="txt-sub">{deck.description}</span>
                                <span className="txt-sub">{deck.questions.length} question{deck.questions.length !== 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    ))
                    }
                </div>
            </div>


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