import { LuListOrdered, LuCheck, LuX } from "react-icons/lu";
import { useEffect, useRef, useState } from "react";

type ViewQuestionsListProps = {
    questions: any[];
    currentIndex: number;
    onSelect?: (index: number) => void;
    questionsAnswered?: any;
    friendsAnswered?: {
        [questionId: string]: Array<{
            uid: string;
            picture: string;
            username: string;
        }>;
    };
};

export default function ViewQuestionsList(props: ViewQuestionsListProps) {
    const items = Array.isArray(props.questions) ? props.questions : [];
    const total = items.length;
    const containerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number>(0);

    useEffect(() => {
        if (containerRef.current?.parentElement) {
            setHeight(containerRef.current.parentElement.clientHeight);
        }
    }, []);

    return (
        <div ref={containerRef} style={{ height: `${height}px` }} className="w-full rounded-2xl p-4 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-minimal flex flex-col gap-2 pr-1">
                {total === 0 ? (
                    <p className="color-txt-sub text-sm">No questions available in this deck.</p>
                ) : (
                    items.map((q, idx) => {
                        const title = q?.properties?.name ?? `Question ${idx + 1}`;
                        const tags = q?.properties?.tags?.join?.(", ");
                        const isActive = idx === props.currentIndex;
                        const questionId = q?.id;
                        const isAnswered = props.questionsAnswered?.[questionId];
                        const isCorrect = props.questionsAnswered?.[questionId] === true;
                        const friendsWhoGotCorrect = props.friendsAnswered?.[questionId] || [];

                        return (
                            <button
                                key={q?.id ?? idx}
                                className={`w-full text-left rounded-xl px-3 py-2 border transition-colors duration-200 ${
                                    isActive
                                        ? "color-bg-accent color-txt-accent txt-bold border-transparent"
                                        : "color-bg color-txt-main border-white/10 hover:border-white/20"
                                }`}
                                onClick={() => props.onSelect?.(idx)}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className={isActive ? "txt-bold" : "txt-sub"}>{title}</span>
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
                                                        className="w-5 h-5 rounded-full  flex items-center justify-center text-[10px] color-txt-sub"
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
                                {/* {tags ? <p className="text-xs color-txt-sub mt-1">{tags}</p> : null} */}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
