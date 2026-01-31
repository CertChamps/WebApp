import { useState, useRef, useEffect } from 'react';
import useFilters from '../hooks/useFilters'; // Ensure TagFilters is exported
import { HiOutlineX } from "react-icons/hi";
import { LuCheck, LuRefreshCw, LuSearch, LuChevronDown, LuChevronUp } from "react-icons/lu";

type FilterProps = {
    // Update onApply to accept the new Record structure
    onApply: (tags: Record<string, string[]>, paths: string[]) => void;
    onClose: () => void;
}

/**
 * LOCAL COMPONENT: TagSelector
 */
function TagSelector({ 
    setId, 
    tags, 
    selectedSetTags, // Only the tags for THIS set
    toggleTag 
}: { 
    setId: string, 
    tags: string[], 
    selectedSetTags: string[], 
    toggleTag: (setId: string, t: string) => void 
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredTags = tags.filter(tag => 
        tag.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort();

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return (
        <div className="space-y-3 relative" ref={dropdownRef}>
            <p className="font-bold txt-sub">Topics</p>
            
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2.5 flex justify-between items-center rounded-lg transition-all cursor-pointer color-bg-grey-5"
            >
                <span className="text-xs txt-sub">
                    {selectedSetTags.length > 0 ? `${selectedSetTags.length} selected` : "Topics..."}
                </span>
                {isOpen ? <LuChevronUp size={14} className="txt-sub"/> : <LuChevronDown size={14} className="txt-sub"/>}
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 color-bg rounded-xl border-1 color-shadow overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-2 border-b color-shadow flex items-center gap-2">
                        <LuSearch size={14} className="txt-sub ml-1"/>
                        <input 
                            autoFocus
                            className="w-full text-xs py-1 focus:outline-none bg-transparent color-txt-main"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="max-h-40 overflow-y-auto p-1 scrollbar-minimal">
                        {filteredTags.map(tag => (
                            <div 
                                key={tag}
                                onClick={() => toggleTag(setId, tag)} // Pass setId
                                className="flex items-center gap-2 px-2 py-2 hover:color-bg-grey-5 rounded-md cursor-pointer"
                            >
                                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center ${
                                    selectedSetTags.includes(tag) ? 'color-bg-accent border-transparent' : 'color-bg-grey-10'
                                }`}>
                                    {selectedSetTags.includes(tag) && <LuCheck size={10} className="color-txt-accent" strokeWidth={4}/>}
                                </div>
                                <span className={`text-xs ${selectedSetTags.includes(tag) ? 'color-txt-main font-semibold' : 'txt-sub'}`}>
                                    {tag}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {selectedSetTags.map(tag => (
                    <button
                        key={tag}
                        onClick={() => toggleTag(setId, tag)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer rounded-md text-[11px] font-bold color-bg-accent color-txt-accent hover:opacity-80 transition-all"
                    >
                        <span>{tag}</span>
                        <HiOutlineX size={12}/>
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function Filter({ onApply, onClose }: FilterProps) {
    const {
        loading,
        availableSets,
        selectedSetIds,
        selectedSections,
        selectedTags, // This is now Record<string, string[]>
        toggleSet,
        toggleSection,
        toggleTag,
        getCollectionPaths
    } = useFilters();

    if (loading) return (
        <div className="w-full h-full flex justify-center items-center color-bg shadow-small">
            <LuRefreshCw size={24} className="animate-spin " />
        </div>
    );

    return (
        <div className="w-[95%] m-auto h-full flex flex-col color-bg shadow-small rounded-out p-5 overflow-hidden">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-bold txt-heading-colour tracking-tight">Filters</h2>
                <button onClick={onClose} className="p-1 rounded-full color-bg-grey transition-colors">
                    <HiOutlineX size={20} className='txt-sub'/>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-6 scrollbar-minimal">
                <div className="space-y-4">
                    <h3 className="text-lg font-bold txt-sub">Question Sets</h3>
                    <div className="space-y-5">
                        {availableSets.map((set: any) => (
                            <div key={set.id} className="space-y-3">
                                <label className="flex items-center gap-3 group cursor-pointer">
                                    <div className={`w-5 h-5 rounded border-1 color-shadow flex items-center justify-center transition-all ${
                                        selectedSetIds.includes(set.id) ? 'color-bg-accent' : 'color-bg-grey-10 '
                                    }`}>
                                        {selectedSetIds.includes(set.id) && <LuCheck size={14} className="color-txt-accent" strokeWidth={4} />}
                                    </div>
                                    <input type="checkbox" className="sr-only" checked={selectedSetIds.includes(set.id)} onChange={() => toggleSet(set.id)} />
                                    <span className={`text-[1rem] ${selectedSetIds.includes(set.id) ? 'color-txt-accent font-semibold' : 'color-txt-sub'}`}>
                                        {set.title}
                                    </span>
                                </label>

                                {selectedSetIds.includes(set.id) && (
                                    <div className="ml-2 pl-4 border-l-2 color-shadow space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                                        <div className="space-y-3 pt-2">
                                            <p className="font-bold txt-sub">Sections</p>
                                            {set.sections?.map((section: string) => (
                                                <label key={section} className="flex items-center gap-3 group cursor-pointer">
                                                    <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                                                        selectedSections.includes(section) ? 'color-bg-accent ' : 'color-bg-grey-10'
                                                    }`}>
                                                        {selectedSections.includes(section) && <LuCheck size={12} className="color-txt-accent" strokeWidth={4} />}
                                                    </div>
                                                    <input type="checkbox" className="sr-only" checked={selectedSections.includes(section)} onChange={() => toggleSection(section)} />
                                                    <span className={`text-sm capitalize ${selectedSections.includes(section) ? 'color-txt-main' : 'color-txt-sub'}`}>
                                                        {section.replace(/-/g, ' ')}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>

                                        {set.tags && set.tags.length > 0 && (
                                            <TagSelector 
                                                setId={set.id}
                                                tags={set.tags} 
                                                selectedSetTags={selectedTags[set.id] || []} // Only pass this set's tags
                                                toggleTag={toggleTag} 
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t color-shadow">
                <button 
                    disabled={selectedSetIds.length === 0}
                    onClick={() => onApply(selectedTags, getCollectionPaths())}
                    className="w-full py-3.5 rounded-xl color-bg-accent color-txt-accent font-bold transition-all disabled:opacity-20 "
                >
                    Apply Selection
                </button>
            </div>
        </div>
    );
}