import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../context/UserContext";
import { doc, setDoc} from 'firebase/firestore';
import { db } from '../../../firebase';
import Rank1 from "../../assets/images/Ranks/Rank1.png"

export default function UsernamePrompt() {
    const { user, setUser } = useContext(UserContext); 
    const [showPrompt, setShowPrompt] = useState<boolean>(false); 
    const [newUsername, setNewUsername] = useState<string>(''); 
    const [error, setError] = useState<string>(''); 

    useEffect(() => {
        
        if(user?.username?.length < 1) 
            setShowPrompt(true); 
        else 
            setShowPrompt(false); 
    }, [user])

    const updateUsername = async () => {
        try {
            const username = newUsername?.trim();


            if ( username?.length > 0) {
                // Update context 
                setUser({...user, username: username})
                // Update firbase 
                await setDoc(doc(db, 'user-data', user.uid), {username: username}, {merge: true})

                // Reset all state 
                setNewUsername("");
                setError('');
                setShowPrompt(false);
            }
            else {
                setError('please input a valid name');
            }

        }
        catch (err) {
            console.log(err)
        }
  
    }

    return (
        <div className={`absolute w-screen h-screen top-0 left-0 right-0 bottom-0 flex justify-center items-center
            color-bg-grey-10 transition-opacity duration-300 z-100 ${showPrompt ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className={`w-[30%] h-[60%] color-bg border-2 color-shadow rounded-out p-4
                    transition-transform duration-300
                    ${showPrompt ? 'scale-100' : 'scale-95'}`}>
                        <img 
                            src={Rank1}
                            className="h-[50%] mx-auto"
                        />
                        <p className="txt-bold text-center w-full">Looks like someone doesn't have a username...</p>
                        <p className="txt color-txt-accent w-full text-center">{error}</p>
                        <input 
                            className="txtbox mx-auto my-2"
                            placeholder="New Username"
                            value={newUsername}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    updateUsername();
                                }
                            }}
                            onChange={(e) => setNewUsername(e.target.value)}/>
                        <div className="blue-btn mx-auto text-center"
                            onClick={() => {updateUsername()}}
                            >Submit</div>
                </div>
        </div>
    )

} 