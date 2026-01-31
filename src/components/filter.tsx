import { useState } from 'react';
import useFilters from '../hooks/useFilters';
import { HiOutlineX } from "react-icons/hi";
import { LuCheck, LuRefreshCw, LuSearch, LuChevronDown } from "react-icons/lu";

type FilterProps = {
    onApply: (tags: string[], paths: string[]) => void;
    onClose: () => void;
}

export default function Filter({ onApply, onClose }: FilterProps) {
    const {
        loading,
        availableSets, // Array of sets, e.g., [{ id: '1', title: 'Certchamps', sections: [...] }]
        selectedSetIds,
        selectedSections,
        selectedTags,
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
        <div className="w-[95%] m-auto h-full flex flex-col color-bg shadow-small rounded-out  p-5 overflow-hidden">
            
            {/* --- HEADER --- */}
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-bold txt-heading-colour tracking-tight">Filters</h2>
                <button onClick={onClose} className="p-1 rounded-full color-bg-grey transition-colors">
                    <HiOutlineX size={20}  className='txt-sub'/>
                </button>
            </div>


            <div className="flex-1 overflow-y-auto pr-1 space-y-6 scrollbar-minimal">
                
                {/* --- NESTED DECK & TOPIC SECTION --- */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold txt-sub ">Question Sets</h3>
                    
                    <div className="space-y-5">
                        {availableSets.map((set: any) => (
                            <div key={set.id} className="space-y-3">
                                
                                {/* PARENT: The Question Set */}
                                <label className="flex items-center gap-3 group cursor-pointer">
                                    <div className={`w-5 h-5 rounded border-1 color-shadow flex items-center justify-center transition-all ${
                                        selectedSetIds.includes(set.id) 
                                        ? 'color-bg-accent' 
                                        : 'color-bg-grey-10 '
                                    }`}>
                                        {selectedSetIds.includes(set.id) && <LuCheck size={14} className="color-txt-accent" strokeWidth={4} />}
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="sr-only" 
                                        checked={selectedSetIds.includes(set.id)}
                                        onChange={() => toggleSet(set.id)}
                                    />
                                    <span className={`text-[1rem] ${selectedSetIds.includes(set.id) ? 'color-txt-accent font-semibold' : 'color-txt-sub'}`}>
                                        {set.title}
                                    </span>
                                </label>

                                {/* CHILDREN: Indented Topics (Threaded design) */}
                                {selectedSetIds.includes(set.id) && (
                                    <div className="ml-2 pl-2 border-l-2 color-shadow space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                        {set.sections?.map((section: string) => (
                                            <label key={section} className="flex items-center gap-3 group cursor-pointer">
                                                <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                                                    selectedSections.includes(section) 
                                                    ? 'color-bg-accent ' 
                                                    : 'color-bg-grey-10'
                                                }`}>
                                                    {selectedSections.includes(section) && <LuCheck size={12} className="color-txt-accent" strokeWidth={4} />}
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    className="sr-only" 
                                                    checked={selectedSections.includes(section)}
                                                    onChange={() => toggleSection(section)}
                                                />
                                                <span className={`text-sm capitalize transition-colors ${selectedSections.includes(section) ? 'color-txt-main' : 'color-txt-sub'}`}>
                                                    {section.replace(/-/g, ' ')}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* --- ACTION BUTTON --- */}
            <div className="mt-6 pt-4 ">
                <button 
                    disabled={selectedSetIds.length === 0}
                    onClick={() => onApply(selectedTags, getCollectionPaths())}
                    className="w-full py-3.5 rounded-xl color-bg-accent color-txt-accent font-bold transition-all disabled:opacity-20 disabled:grayscale shadow-lg shadow-blue-900/10"
                >
                    Apply Selection
                </button>
            </div>
        </div>
    );
}