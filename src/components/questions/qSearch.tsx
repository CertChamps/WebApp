import { useEffect, useRef, useState } from "react"
import Fuse from 'fuse.js'
import useQuestions from "../../hooks/useQuestions"
import RenderMath from "../math/mathdisplay"
import { LuSearch, LuX } from "react-icons/lu"
import type { ExamPaper, PaperQuestion } from "../../hooks/useExamPapers"

/** Fuse.js v7 search result type */
type FuseResult<T> = { item: T; refIndex: number; score?: number }

type CertChampsSearchProps = {
    mode: "certchamps";
    setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
    questions: any[];
    position: number;
    setPosition: (n: number | ((p: number) => number)) => void;
    /** Collection paths for certchamps (e.g. ["questions/certchamps"] or subject-scoped). Defaults to ["questions/certchamps"] when omitted. */
    collectionPaths?: string[];
}

/** One searchable row when searching across all papers (paper + question + index in that paper). */
export type PaperSearchEntry = {
    paper: ExamPaper;
    question: PaperQuestion;
    indexInPaper: number;
    paperLabel: string;
    questionName: string;
    tagsStr: string;
}

type PastPaperSearchProps = {
    mode: "pastpaper";
    setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
    papers: ExamPaper[];
    getPaperQuestions: (paper: ExamPaper) => Promise<PaperQuestion[]>;
    onSelectPaperQuestion: (paper: ExamPaper, indexInPaper: number) => void;
}

export type QSearchProps = CertChampsSearchProps | PastPaperSearchProps;

export default function QSearch(props: QSearchProps) {

    const [results, setResults] = useState<FuseResult<PaperSearchEntry | any>[]>([])
    const [search, setSearch] = useState('')
    const [isVisible, setIsVisible] = useState(false)
    const [loadingAllPapers, setLoadingAllPapers] = useState(false)
    const searchContainerRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement>(null);

    const isCertChamps = props.mode === "certchamps";
    const collectionPaths = isCertChamps ? (props.collectionPaths ?? ["questions/certchamps"]) : [];
    const { fetchAllQuestions } = useQuestions({ collectionPaths });
    const fuse = useRef<Fuse<PaperSearchEntry | any> | null>(null);

    const certChampsSearchOptions = {
        keys: ["content.question", "properties.name"],
        isCaseSensitive: false,
    };

    const paperSearchOptions = {
        keys: ["questionName", "tagsStr", "paperLabel"],
        isCaseSensitive: false,
    };

    useEffect(() => {
        setIsVisible(true);
        inputRef.current?.focus();

        if (props.mode === "pastpaper") {
            const { papers, getPaperQuestions } = props as PastPaperSearchProps;
            setLoadingAllPapers(true);
            Promise.all(
                papers.map(async (paper) => {
                    const questions = await getPaperQuestions(paper);
                    const label = paper.label ?? paper.id ?? "";
                    return questions.map((q, indexInPaper) => ({
                        paper,
                        question: q,
                        indexInPaper,
                        paperLabel: label,
                        questionName: q.questionName ?? q.id ?? "",
                        tagsStr: Array.isArray(q.tags) ? q.tags.join(", ") : "",
                    } as PaperSearchEntry));
                })
            )
                .then((arrays) => {
                    const flat: PaperSearchEntry[] = arrays.flat();
                    fuse.current = new Fuse(flat, paperSearchOptions);
                    setLoadingAllPapers(false);
                })
                .catch(() => setLoadingAllPapers(false));
            return;
        }

        const init = async () => {
            const q = await fetchAllQuestions();
            if (q?.length != null) {
                fuse.current = new Fuse(q, certChampsSearchOptions);
            }
        };
        init();
    }, [
        props.mode,
        isCertChamps ? (props as CertChampsSearchProps).collectionPaths?.join(",") ?? "default" : "",
        props.mode === "pastpaper" ? (props as PastPaperSearchProps).papers : undefined,
    ]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                handleClose();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [props]);

    useEffect(() => {
        if (fuse.current) {
            setResults(fuse.current.search(search));
        }
    }, [search]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => {
            props.setShowSearch(false);
            setSearch('');
        }, 300);
    };

    const handleSelect = (item: any) => {
        if (props.mode === "certchamps") {
            props.questions[props.position + 1] = item;
            props.setPosition((prev) => prev + 1);
        } else {
            const entry = item as PaperSearchEntry;
            if (entry?.paper != null && typeof entry.indexInPaper === "number") {
                props.onSelectPaperQuestion(entry.paper, entry.indexInPaper);
            }
        }
        handleClose();
    };

    const isPaperEntry = (item: any): item is PaperSearchEntry =>
        props.mode === "pastpaper" && item != null && "paper" in item && "indexInPaper" in item;

    return (
        <div
            className={`fixed left-0 top-0 w-[100vw] h-[100vh] color-bg-grey-10 z-[9999]
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
                    <LuSearch className="color-txt-sub ml-2" strokeWidth={2} size={20} />
                    <input
                        type="text"
                        ref={inputRef}
                        className="outline-none w-full p-2 font-bold placeholder:color-txt-sub
                            color-txt-main rounded-out"
                        placeholder={props.mode === "pastpaper" ? "Search paper questions..." : "Search questions..."}
                        value={search}
                        onChange={(txt) => setSearch(txt.target.value)}
                    />
                    <LuX className="color-txt-sub mr-2 justify-self-end" strokeWidth={2} size={24}
                        onClick={handleClose} />
                </div>

                <div className="h-[85%] overflow-auto scrollbar-minimal mt-2">
                    {loadingAllPapers ? (
                        <div className="flex flex-col items-center justify-center py-12 color-txt-sub">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--grey-10)] border-t-[var(--grey-5)] mb-3" />
                            <span>Loading questions from all papers…</span>
                        </div>
                    ) : (
                    results.map((result: FuseResult<PaperSearchEntry | any>) => {
                        const item = result.item;
                        if (isPaperEntry(item)) {
                            return (
                                <div
                                    key={`${item.paper.id}-${item.question.id}`}
                                    className="p-3 border-b-2 color-shadow hover:color-bg-grey-5 cursor-pointer"
                                    onClick={() => handleSelect(item)}
                                >
                                    <div>
                                        <span className="txt-bold color-txt-accent">{item.questionName}</span>
                                        {item.tagsStr ? <span className="txt-sub mx-2">{item.tagsStr}</span> : null}
                                    </div>
                                    <div className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[80%] color-txt-sub text-sm mt-0.5">
                                        <span className="italic">{item.paperLabel}</span>
                                    </div>
                                </div>
                            );
                        }
                        const name = item?.properties?.name ?? "";
                        const tags = Array.isArray(item?.properties?.tags) ? item.properties.tags.join(", ") : "";
                        const questionText = item?.content && Array.isArray(item.content) && item.content[0]?.question
                            ? item.content[0].question
                            : "";
                        return (
                            <div
                                key={item?.id ?? result.refIndex}
                                className="p-3 border-b-2 color-shadow hover:color-bg-grey-5 cursor-pointer"
                                onClick={() => handleSelect(item)}
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
                    })
                    )}
                </div>
            </div>
        </div>
    );
}
