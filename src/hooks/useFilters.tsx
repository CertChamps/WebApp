import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export type QuestionSet = {
    id: string;      // 'certchamps'
    title: string;   // 'Cert Champs'
    sections: string[]; // ['algebra', 'calculus']
    tags: string[];  // ['2023', 'Hard', 'Calculus']
}

export default function useFilters() {
    const [loading, setLoading] = useState(true);
    const [availableSets, setAvailableSets] = useState<QuestionSet[]>([]);
    
    // User Selections
    const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);
    const [selectedSections, setSelectedSections] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // 1. Fetch available sets on mount
    useEffect(() => {
        const fetchMetadata = async () => {
            setLoading(true);
            try {
                const querySnapshot = await getDocs(collection(db, "questions"));
                const sets: QuestionSet[] = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    title: doc.data().title || doc.id,
                    sections: doc.data().sections || [],
                    tags: doc.data().tagCloud || [] // Pre-aggregated tags for UI performance
                }));
                setAvailableSets(sets);
            } catch (err) {
                console.error("Error fetching filter metadata:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchMetadata();
    }, []);

    // 2. Toggles
    const toggleSet = (id: string) => {
        setSelectedSetIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSection = (section: string) => {
        setSelectedSections(prev => 
            prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
        );
    };

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // 3. Derived State for UI
    // Only show sections belonging to selected Sets
    const activeSectionsList = availableSets
        .filter(set => selectedSetIds.includes(set.id))
        .flatMap(set => set.sections);

    // Only show tags belonging to selected Sets
    const activeTagsList = availableSets
        .filter(set => selectedSetIds.includes(set.id))
        .flatMap(set => set.tags);

    // Generate the path strings for your useQuestions hook
    const getCollectionPaths = useCallback(() => {
        const paths: string[] = [];
        selectedSetIds.forEach(setId => {
            const set = availableSets.find(s => s.id === setId);
            if (set) {
                // If specific sections are selected, only use those. 
                // Otherwise, use all sections in the set.
                const sectionsToInclude = selectedSections.length > 0 
                    ? set.sections.filter(s => selectedSections.includes(s))
                    : set.sections;

                sectionsToInclude.forEach(sec => {
                    paths.push(`questions/${setId}/${sec}`);
                });
            }
        });
        return paths;
    }, [availableSets, selectedSetIds, selectedSections]);

    return {
        loading,
        availableSets,
        selectedSetIds,
        selectedSections,
        selectedTags,
        activeSectionsList,
        activeTagsList,
        toggleSet,
        toggleSection,
        toggleTag,
        getCollectionPaths
    };
}