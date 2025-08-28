// Styles 
import '../styles/decks.css'

// Hooks
import { useContext, useState } from "react"
import { useNavigate } from "react-router-dom"
import useDeckHandler from "../hooks/useDeckHandler"

// Context 
import { UserContext } from "../context/UserContext"

// Components 
import { CirclePicker } from "react-color"

// Component Props 
type deckProps = {
    question: string
}

export default function ViewDecks (props?: deckProps) {

    //================================= State, Hooks, and Context ================================//
    const [view, setView] = useState<string>('decks')
    const [name, setName] = useState('')
    const [desc, setDesc] = useState('')
    const [color, setColor] = useState('')

    const { user } = useContext(UserContext)

    const navigate = useNavigate() 
    const { createDeck, addQuestiontoDeck } = useDeckHandler()
    //==========================================================================================//

    return (
    <div className="h-container items-start w-full overflow-y-scroll p-4">
        {
            //==================================== VIEW USER DECKS ===================================//
            view === 'decks' ? (
            <div className="w-full">
                {
                    //================================= DECK CARD ===================================//
                    user.decks?.map( (deck: any) => (
                        <div key={deck.id} className="deck" onClick={() => {navigate(`/decks/${user.uid}/${deck.id}`)}}>

                            <div className={`color-strip`} style={{backgroundColor: deck.color}} ></div>

                            <div className="deck-txt">
                                <span className="txt-heading-colour">{deck.name}</span>
                                <span className="txt-sub">{deck.timestamp ? new Date(deck.timestamp.seconds * 1000).toLocaleDateString() : ''}</span>
                            </div>

                            <div className="deck-txt">
                                <span className="txt-sub">{deck.description}</span>
                                <span className="txt-sub">{deck?.questions?.length} question{deck?.questions?.length !== 1 ? 's' : ''}</span>
                            </div>

                            <span className="plain-btn color-txt-main cursor-pointer my-2 bg-green-300" onClick={(e: any) => {addQuestiontoDeck([props?.question], deck.id); e.stopPropagation();}}>Add to deck</span>

                        </div>
                    ))
                    //==============================================================================//
                }

                {/*=================================== NEW DECK BUTTON ==================================*/}
                <div className="new-deck my-3" onClick={() => setView('create')}>
                    <p className="color-txt-main text-center">New Deck</p>
                </div>
                {/*======================================================================================*/}

            </div>
            //=========================================================================================//

            //==================================== CREATE DECK VIEW ===================================//
            ) : view === 'create' ? (
            <div className="w-full">

                <p onClick={() => setView('decks')}>Back</p>

                <input type="text" className="txtbox m-4" placeholder="Name" 
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setName(txt.target.value)}}/>
                <input type="text" className="txtbox m-4" placeholder="Description"
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setDesc(txt.target.value)}}/>

                <CirclePicker color={color} onChangeComplete={(color:any) => {setColor(color.hex)}} />

                <span className="create-deck" onClick={() => {createDeck(name, desc, [props?.question ?? null], color); setView('decks')}} >Create Deck</span>

            </div>
            ) : null
            //=========================================================================================//

        }
        


    </div>
    )
}