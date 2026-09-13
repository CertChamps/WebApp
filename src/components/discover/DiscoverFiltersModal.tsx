import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";

export type ResourceType = "Notes" | "Videos" | "Sample Answers" | "Flashcards" | "Website" | "Other";
export type DiscoverSortBy = "rating" | "date";

type Props = {
    open: boolean;
    onClose: () => void;
    anchorRef: RefObject<HTMLElement | null>;
    selectedTypes: ResourceType[];
    onSelectedTypesChange: (types: ResourceType[]) => void;
    sortBy: DiscoverSortBy;
    onSortByChange: (sort: DiscoverSortBy) => void;
    resourceTypes: ResourceType[];
};

const SORT_OPTIONS: Array<{ id: DiscoverSortBy; label: string }> = [
    { id: "rating", label: "Rating" },
    { id: "date", label: "Date uploaded" },
];

export default function DiscoverFiltersModal({
    open,
    onClose,
    anchorRef,
    selectedTypes,
    onSelectedTypesChange,
    sortBy,
    onSortByChange,
    resourceTypes,
}: Props) {
    const [draftTypes, setDraftTypes] = useState<ResourceType[]>(selectedTypes);
    const [draftSort, setDraftSort] = useState<DiscoverSortBy>(sortBy);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraftTypes(selectedTypes);
        setDraftSort(sortBy);
    }, [open, selectedTypes, sortBy]);

    const updatePos = () => {
        const el = anchorRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setPos({
            top: rect.bottom + 8,
            right: Math.max(8, window.innerWidth - rect.right),
        });
    };

    useLayoutEffect(() => {
        if (!open) return;
        updatePos();
        window.addEventListener("resize", updatePos);
        window.addEventListener("scroll", updatePos, true);
        return () => {
            window.removeEventListener("resize", updatePos);
            window.removeEventListener("scroll", updatePos, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function handleOutside(e: MouseEvent | FocusEvent) {
            const target = e.target as Node | null;
            if (
                anchorRef.current?.contains(target) ||
                panelRef.current?.contains(target)
            ) {
                return;
            }
            onClose();
        }
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("mousedown", handleOutside);
        document.addEventListener("focusin", handleOutside);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleOutside);
            document.removeEventListener("focusin", handleOutside);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open, onClose, anchorRef]);

    if (!open || !pos) return null;

    const toggleType = (type: ResourceType) => {
        setDraftTypes((current) =>
            current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
        );
    };

    const handleApply = () => {
        onSelectedTypesChange(draftTypes);
        onSortByChange(draftSort);
        onClose();
    };

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[200] w-[min(90vw,28rem)] overflow-hidden rounded-2xl border-2 color-shadow color-bg shadow-none"
            style={{ top: pos.top, right: pos.right }}
            role="dialog"
            aria-label="Filters"
        >
            <div className="p-5">
                <div className="grid grid-cols-2 gap-8">
                    <section>
                        <h3 className="text-base font-bold color-txt-main mb-3">
                            Type
                        </h3>
                        <div className="flex flex-col">
                            {resourceTypes.map((type) => {
                                const active = draftTypes.includes(type);
                                return (
                                    <div key={type} className="flex items-center justify-between gap-3 py-1.5">
                                        <button
                                            type="button"
                                            onClick={() => toggleType(type)}
                                            className={`text-sm font-medium text-left cursor-pointer ${
                                                active ? "color-txt-accent" : "color-txt-sub hover:color-txt-main"
                                            }`}
                                        >
                                            {type}
                                        </button>
                                        {active && (
                                            <button
                                                type="button"
                                                onClick={() => toggleType(type)}
                                                className="color-txt-sub hover:color-txt-main cursor-pointer p-0.5"
                                                aria-label={`Remove ${type}`}
                                            >
                                                <LuX size={15} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-base font-bold color-txt-main mb-3">
                            Sort by
                        </h3>
                        <div className="flex flex-col">
                            {SORT_OPTIONS.map((option) => {
                                const active = draftSort === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setDraftSort(option.id)}
                                        className={`text-sm font-medium text-left cursor-pointer py-1.5 ${
                                            active ? "color-txt-accent" : "color-txt-sub hover:color-txt-main"
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        type="button"
                        onClick={handleApply}
                        className="inline-flex items-center justify-center px-4 py-1.5 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm cursor-pointer hover:opacity-90"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>,
        getThemedPortalTarget()
    );
}
