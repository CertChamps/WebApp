import { LuCheck, LuX, LuChevronDown, LuChevronRight } from "react-icons/lu";
import { useEffect, useRef, useState } from "react";
import useQuestions from "../../hooks/useQuestions";
import RenderMath from "../math/mathdisplay";

type ViewQuestionsListProps = {
    questions: any[];
    currentIndex: number;
    currentPart?: number;
    onSelect?: (index: number, part?: number) => void;
    questionsAnswered?: any;
    partsAnswered?: {
        [questionId: string]: {
            [partIndex: number]: boolean; // true = correct, false = incorrect
        };
    };
    friendsAnswered?: {
        [questionId: string]: Array<{
            uid: string;
            picture: string;
            username: string;
        }>;
    };
    deckMode?: boolean;
};

export default function ViewQuestionsList(props: ViewQuestionsListProps) {
    const items = Array.isArray(props.questions) ? props.questions : [];
    const total = items.length;
    const containerRef = useRef<HTMLDivElement>(null);
    const partRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const [height, setHeight] = useState<number>(0);
    const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
    const { toRoman } = useQuestions();

    useEffect(() => {
        if (containerRef.current?.parentElement) {
            setHeight(containerRef.current.parentElement.clientHeight);
        }
    }, []);

    // Auto-expand current question in deck mode
    useEffect(() => {
        if (props.deckMode) {
            setExpandedQuestions(new Set([props.currentIndex]));
        }
    }, [props.currentIndex, props.deckMode]);

    // Auto-scroll to current part when it changes
    useEffect(() => {
        const key = `${props.currentIndex}-${props.currentPart}`;
        if (partRefs.current[key]) {
            partRefs.current[key]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [props.currentIndex, props.currentPart]);

    const toggleExpand = (idx: number) => {
        setExpandedQuestions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(idx)) {
                newSet.delete(idx);
            } else {
                newSet.add(idx);
            }
            return newSet;
        });
    };

    const getPartStatus = (questionId: string, partIndex: number): boolean | undefined => {
        return props.partsAnswered?.[questionId]?.[partIndex];
    };

    return (
        <div ref={containerRef} style={{ height: `${height}px` }} className="w-full rounded-2xl p-4 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-minimal flex flex-col gap-2 pr-1">
                {total === 0 ? (
                    <p className="color-txt-sub text-sm">No questions available in this deck.</p>
                ) : (
                    items.map((q, idx) => {
                        const title = q?.properties?.name ?? `Question ${idx + 1}`;
                        const isActive = idx === props.currentIndex;
                        const questionId = q?.id;
                        const isAnswered = props.questionsAnswered?.[questionId];
                        const isCorrect = props.questionsAnswered?.[questionId] === true;
                        const friendsWhoGotCorrect = props.friendsAnswered?.[questionId] || [];
                        const parts = q?.content ?? [];
                        const hasParts = parts.length > 1;
                        const isExpanded = expandedQuestions.has(idx);

                        return (
                            <div key={q?.id ?? idx} className="flex flex-col">
                                {/* Main Question Button */}
                                <button
                                    className={`w-full text-left rounded-xl px-3 py-2 border transition-all duration-200 ${
                                        isActive && props.currentPart === undefined
                                            ? "color-bg-accent color-txt-accent txt-bold border-transparent"
                                            : isActive
                                            ? "color-bg-accent/30 color-txt-accent border-transparent"
                                            : "color-bg color-txt-main border-white/10 hover:border-white/20"
                                    }`}
                                    onClick={() => {
                                        if (hasParts) {
                                            toggleExpand(idx);
                                        }
                                        props.onSelect?.(idx, 0);
                                    }}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            {hasParts && (
                                                <span className="color-txt-sub">
                                                    {isExpanded ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
                                                </span>
                                            )}
                                            <span className={isActive ? "txt-bold" : "txt-sub"}>{title}</span>
                                            {hasParts && (
                                                <span className="text-xs color-txt-sub color-bg-grey-5 px-2 py-0.5 rounded-full">
                                                    {parts.length} parts
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isAnswered !== undefined && (
                                                isCorrect ? (
                                                    <LuCheck className="text-green-500" size={18} />
                                                ) : (
                                                    <LuX className="text-red-500" size={18} />
                                                )
                                            )}
                                            {friendsWhoGotCorrect.length > 0 && (
                                                <div className="flex -space-x-2">
                                                    {friendsWhoGotCorrect.slice(0, 3).map((friend, i) => (
                                                        <img
                                                            key={friend.uid}
                                                            src={friend.picture}
                                                            alt={friend.username}
                                                            title={friend.username}
                                                            className="w-5 h-5 rounded-full object-cover"
                                                            style={{ zIndex: 3 - i }}
                                                        />
                                                    ))}
                                                    {friendsWhoGotCorrect.length > 3 && (
                                                        <div 
                                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] color-txt-sub"
                                                            title={`+${friendsWhoGotCorrect.length - 3} more`}
                                                        >
                                                            +{friendsWhoGotCorrect.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <span className="text-xs color-txt-sub">#{idx + 1}</span>
                                        </div>
                                    </div>
                                </button>

                                {/* Parts Dropdown */}
                                {hasParts && isExpanded && (
                                    <div className="ml-4 mt-2 flex flex-col gap-3 border-l-2 border-white/10 pl-4">
                                        {parts.map((part: any, partIdx: number) => {
                                            const partStatus = getPartStatus(questionId, partIdx);
                                            const isPartActive = isActive && props.currentPart === partIdx;
                                            
                                            return (
                                                <div
                                                    key={partIdx}
                                                    ref={(el) => { partRefs.current[`${idx}-${partIdx}`] = el; }}
                                                    className={`rounded-xl p-3 transition-all duration-200 cursor-pointer ${
                                                        isPartActive
                                                            ? "color-bg-grey-5"
                                                            : "hover:color-bg-grey-5/50"
                                                    }`}
                                                    onClick={() => props.onSelect?.(idx, partIdx)}
                                                >
                                                    {/* Part Header */}
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-bold ${isPartActive ? 'color-txt-accent' : 'color-txt-main'}`}>
                                                                {toRoman(partIdx + 1)})
                                                            </span>
                                                            {partStatus !== undefined && (
                                                                partStatus ? (
                                                                    <LuCheck className="text-green-500" size={16} />
                                                                ) : (
                                                                    <LuX className="text-red-500" size={16} />
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Part Question Content */}
                                                    <div className="color-txt-sub text-sm">
                                                        <RenderMath text={part?.question ?? ""} className="txt leading-relaxed" />
                                                    </div>
                                                    
                                                    {/* Part Image */}
                                                    {part?.image && (
                                                        <img
                                                            src={part.image}
                                                            alt={`Part ${partIdx + 1}`}
                                                            className="mt-2 w-full max-w-[200px] rounded-lg object-cover"
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
