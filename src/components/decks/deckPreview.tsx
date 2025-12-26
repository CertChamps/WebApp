import { useEffect, useState, useContext } from "react"
import { useNavigate } from "react-router-dom"
import RenderMath from "../math/mathdisplay"
import { LuArrowLeft } from "react-icons/lu"
import useFetch from "../../hooks/useFetch"
import { UserContext } from "../../context/UserContext"
import useDeckHandler from "../../hooks/useDeckHandler"

type DeckPreviewProps = {
    deck?: any
    questions?: any[]
    onBack?: () => void
    deckId?: string
}

export default function DeckPreview({ deck, questions, onBack, deckId }: DeckPreviewProps) {
    const [collapsed, setCollapsed] = useState(false)
    const navigate = useNavigate()
    const totalQuestions = questions?.length ?? deck?.questions?.length ?? 0
    const { fetchUsernameByID } = useFetch()
    const [creatorName, setCreatorName] = useState<string>("")
    const { user } = useContext(UserContext)
    const { addtoDecks } = useDeckHandler()
    const toRoman = (n: number) => {
        const map = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"]
        return map[n] ?? `${n}`
    }


    useEffect(() => {
        const getCreatorName = async () => {
            if (deck?.createdBy) {
                const name = await fetchUsernameByID(deck.createdBy)
                setCreatorName(name)
            }   
        }
        getCreatorName()
    }, [deck])

    if (!deck) {
        return (
            <div className="w-full flex justify-center py-10">
                <span className="txt-sub">Loading deck preview...</span>
            </div>
        )
    }

    return (
        <div className="w-full px-6 flex justify-center">
            <div className="w-full max-w-7xl rounded-2xl border color-shadow color-bg shadow-small backdrop-blur-md p-6">
                <div className="flex items-center justify-between mb-4">
                    <button
                        type="button"
                        className="hover:opacity-75 duration-100 transition-all color-txt-main cursor-pointer flex items-center gap-2"
                        onClick={onBack}
                    >
                        <LuArrowLeft className="txt" size={24} />
                        <span className="txt">Back</span>
                    </button>
                </div>

                <div className="color-bg p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl color-shadow">
                    <div className="flex flex-col">
                        <span className="txt-sub">Deck name</span>
                        <span className="txt-heading-colour text-lg">{deck.name || "Untitled deck"}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="txt-sub">Created by</span>
                        <span className="txt-heading-colour text-lg">{creatorName || "Unknown creator"}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="txt-sub block">Description</span>
                        <p className="txt-heading-colour leading-relaxed">{deck.description || "No description provided."}</p>
                    </div>

                    <div className="blue-btn text-center py-2 h-8 flex items-center justify-center cursor-pointer" onClick={async () => {
                        if (!user?.uid) return
                        const targetId = deckId ?? deck?.id
                        if (!targetId) return
                        await addtoDecks(targetId, user.uid);
                        navigate(`/decks/${targetId}`);
                    }}>Add to "My Decks"</div>
       
                </div>

                <div className=" color-shadow color-bg p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <p className="txt-heading-colour text-lg">Questions ({totalQuestions})</p>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="px-3 py-1 rounded-full border color-shadow color-bg hover:color-bg-grey-10 txt-sub transition-colors"
                                onClick={() => setCollapsed((v) => !v)}
                            >
                                {collapsed ? "Show" : "Hide"}
                            </button>
                        </div>
                    </div>

                        <div
                            className="overflow-hidden transition-all duration-300 ease-out"
                            style={{
                                maxHeight: collapsed ? 0 : 420,
                                opacity: collapsed ? 0 : 1,
                                pointerEvents: collapsed ? "none" : "auto"
                            }}
                        >
                            <div className="flex flex-col gap-4 max-h-[420px] overflow-auto pr-1 scrollbar-minimal">
                                {questions?.length ? questions.map((q, idx) => {
                                    const parts = Array.isArray(q?.content) ? q.content : []
                                    return (
                                        <div key={q?.id ?? idx} className="rounded-lg border color-shadow color-bg p-4 shadow-small">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="txt-sub">Q{idx + 1}</span>
                                                <span className="txt-sub">{q?.properties?.name || "Untitled question"}</span>
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                {parts.length ? parts.map((p: any, partIdx: number) => (
                                                    <div key={partIdx} className="flex gap-3 items-start">
                                                        {parts.length > 1 ? <span className="txt-sub min-w-[28px]">Part {toRoman(partIdx + 1)}</span> : null}
                                                        <RenderMath text={p?.question ?? ""} className="txt leading-relaxed" />
                                                    </div>
                                                )) : <RenderMath text={"No question text"} className="txt-heading-colour" />}
                                            </div>
                                            {q?.properties?.tags?.length ? (
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {q.properties.tags.map((tag: string) => (
                                                        <span key={tag} className="px-2 py-1 rounded-full color-bg-grey-10 txt-sub text-xs">{tag}</span>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                }) : (
                                    <span className="txt-sub">No questions available yet.</span>
                                )}
                            </div>
                        </div>
                </div>
            </div>
        </div>
    )
}
