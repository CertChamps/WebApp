import { useEffect, useRef, useState } from "react"
import Fuse from 'fuse.js'
import useQuestions from "../../hooks/useQuestions"
import RenderMath from "../math/mathdisplay"
import { LuSearch, LuX } from "react-icons/lu"

type searchProps = {
    setShowSearch: React.Dispatch<React.SetStateAction<any>>
    questions: any[];
    position: number;
    setPosition: (n: number | ((p: number) => number)) => void;
}

export default function QSearch(props: searchProps) {
   
    const [results, setResults] = useState([])
    const [search, setSearch] = useState('')
    const [isVisible, setIsVisible] = useState(false)
    const searchContainerRef = useRef<any>(null)
    const inputRef = useRef<HTMLInputElement>(null);

    const collectionPaths = [// Default paths
        "questions/certchamps",
        "questions/exam-papers",
    ]

    const { fetchAllQuestions } = useQuestions({ collectionPaths })
    const fuse = useRef<any>(null)

    const searchOptions = {
        keys: [
            "content.question", 
            "properties.name"
        ], 
        isCaseSensitive: false
    }

    useEffect(() => {
        // Trigger fade in animation
        setIsVisible(true)
        inputRef.current?.focus();
        
        const init = async () => {
            // set questions 
            const q = await fetchAllQuestions()
            console.log("Fetched questions for search:", q?.length)

            // set up fuse 
            fuse.current = new Fuse(q, searchOptions)
        }

        init()
    }, [])

    useEffect(() => {
        // Handle click outside the search container
        function handleClickOutside(event:any) {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
                handleClose()
            }
        }

        // Add event listener when component mounts
        document.addEventListener("mousedown", handleClickOutside)

        // Clean up event listener when component unmounts
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [props])

    useEffect(() => {
        if (fuse.current) {
            setResults(fuse.current.search(search))
        }
    }, [search])

    const handleClose = () => {
        // Trigger fade out animation
        setIsVisible(false)
     
        // Wait for animation to complete before closing
        setTimeout(() => {
            props.setShowSearch(false)
            setSearch('')
        }, 300) // Match this duration with the CSS transition duration
    }

    const handleSelect = (question: any) => {

        // set the next question and advance forward
        props.questions[props.position + 1] = question
        props.setPosition(prev => prev + 1)

        // close the search 
        handleClose()

    }

    return (
        <div 
            className={`absolute left-0 top-0 w-[100vw] h-[100vh] color-bg-grey-10 z-50
                flex items-center justify-center transition-opacity duration-300
                ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        >
            <div 
                ref={searchContainerRef}
                className={`w-[50%] h-[60%] color-bg border-2 color-shadow rounded-out p-4
                    transition-transform duration-300
                    ${isVisible ? 'scale-100' : 'scale-95'}`}
            >   
                <div className="outline-none w-full color-bg-grey-5 font-bold placeholder:color-txt-sub
                    color-txt-main rounded-out flex items-center p-1">
                <LuSearch className="color-txt-sub ml-2" strokeWidth={2} size={20}/>
                <input 
                    type="text" 
                    ref={inputRef}
                    className="outline-none w-full p-2 font-bold placeholder:color-txt-sub
                    color-txt-main rounded-out" 
                    placeholder="Search Questions..."
                    value={search} 
                    onChange={(txt) => {setSearch(txt.target.value)}}
                />
                <LuX className="color-txt-sub mr-2 justify-self-end" strokeWidth={2} size={24}
                    onClick={handleClose}/>
                </div>
                    
                <div className="h-[85%] overflow-auto scrollbar-minimal mt-2">
                    {results.map((result: any) => {
                        const item = result.item;
                        const name = item?.properties?.name ?? "";
                        const tags = Array.isArray(item?.properties?.tags) ? item.properties.tags.join(", ") : "";
                        const questionText = item?.content && Array.isArray(item.content) && item.content[0]?.question
                            ? item.content[0].question
                            : "";
                        return (
                            <div
                                className="p-3 border-b-2 color-shadow hover:color-bg-grey-5"
                                onClick={() => { handleSelect(item) }}
                            >
                                <div>
                                    <span className="txt-bold color-txt-accent">{name}</span>
                                    <span className="txt-sub mx-2">{tags}</span>
                                </div>
                                <div className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[80%]">
                                    {questionText ? (
                                        <RenderMath
                                            className="color-txt-sub italic m-1 inline"
                                            text={questionText}
                                        />
                                    ) : (
                                        <span className="color-txt-sub italic m-1">No preview available</span>
                                    )}
                                    <span className="color-txt-sub italic m-1">...</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    )
}