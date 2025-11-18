import { useState, useRef } from 'react';

export default function useFilters() {
    // Stable unique key generator for subtopics
    const subTopicKeyCounter = useRef(0);

    const [ unselectedTopics, setUnselectedTopics ] = useState<{key: number, topic: string, subTopics: string[]}[]>([
        { key: 1, topic: 'Algebra', subTopics: ['Cubics', 'Expressions & Factorising', 'Indices & Logs', 'Inequalities', 'Quadratics', 'Simultaneous Equations', 'Solving Equations'] },
        { key: 2, topic: 'Area & Volume', subTopics: []},
        { key: 3, topic: 'Calculus', subTopics: ['Differentiation', 'Applications of Differentiation', 'Functions', 'Integration'] },
        { key: 4, topic: 'Complex Numbers', subTopics: [] },
        { key: 5, topic: 'Financial Maths', subTopics: [] },
        { key: 6, topic: 'Coordinate Geometry', subTopics: ['Line', 'Circle'] },
        { key: 7, topic: 'Probability', subTopics: [] },
        { key: 8, topic: 'Sequences & Series', subTopics: [] },
        { key: 9, topic: 'Statistics', subTopics: ['Descriptive', 'Inferential', 'ZScores'] },
        { key: 10, topic: 'Trigonometry', subTopics: ['Functions & Identities', 'Triangles'] },
        { key: 11, topic: 'Geometry', subTopics: [] },
        { key: 12, topic: 'First Year Algebra', subTopics: [] },
    ]);
    
    const [ selectedTopics, setSelectedTopics ] = useState<{key: number, topic: string, subTopics: string[]}[]>([])
    const [ unselectedSubTopics, setUnselectedSubTopics ] = useState<{parent: string, key: number, topic: string}[]>([])
    const [ selectedSubTopics, setSelectedSubTopics ] = useState<{parent: string, key: number, topic: string}[]>([])
    const [ localFilters, setLocalFilters ] = useState<string[]>([])

    const selectTopic = (topic: {key: number, topic: string, subTopics: string[]}) => {
        setSelectedTopics(prev => [...prev, topic]);
        setUnselectedTopics(prev => prev.filter(tpc => tpc !== topic));
        
        topic.subTopics.forEach(sub => {
            setUnselectedSubTopics(prev => [...prev, {
                parent: topic.topic, 
                key: subTopicKeyCounter.current++, // Unique sequential key
                topic: sub
            }]);
        });
        
        setLocalFilters(prev => {
            const newFilter = topic.topic;
            return prev.includes(newFilter) ? prev : [...prev, newFilter];
        });
    }

    const unselectTopic = (topic: {key: number, topic: string, subTopics: string[]}) => {
        setUnselectedTopics(prev => [...prev, topic]);
        setSelectedTopics(prev => prev.filter(tpc => tpc !== topic));
        
        // Remove all subtopics for this topic from both lists
        topic.subTopics.forEach(sub => {
            setUnselectedSubTopics(prev => prev.filter(tpc => tpc.topic !== sub));
            setSelectedSubTopics(prev => prev.filter(tpc => tpc.topic !== sub));
        });
        
        // Remove topic and all its subtopics from filters atomically
        setLocalFilters(prev => {
            const toRemove = new Set([topic.topic, ...topic.subTopics]);
            return prev.filter(f => !toRemove.has(f));
        });
    }

    const selectSubTopic = (topic: { parent: string, key: number, topic: string}) => {
        setSelectedSubTopics(prev => [...prev, topic]);
        setUnselectedSubTopics(prev => prev.filter(tpc => tpc !== topic));
        
        // Add subtopic filter and remove parent topic filter
        setLocalFilters(prev => {
            const next = [...prev];
            if (!next.includes(topic.topic)) next.push(topic.topic);
            return next.filter(f => f !== topic.parent);
        });
    }

    const unselectSubTopic = (topic: {parent: string, key: number, topic: string}) => {
        // Check if this is the last subtopic for its parent BEFORE removing
        const remainingSubtopics = selectedSubTopics.filter(
            t => t.parent === topic.parent && t.key !== topic.key
        );
        const isLastSubtopicForParent = remainingSubtopics.length === 0;
        
        setSelectedSubTopics(prev => prev.filter(tpc => tpc !== topic));
        setUnselectedSubTopics(prev => [...prev, topic]);
        setLocalFilters(prev => prev.filter(tpc => tpc !== topic.topic));
        
        // If last subtopic, restore parent topic filter
        if (isLastSubtopicForParent) {
            setLocalFilters(prev => {
                return prev.includes(topic.parent) ? prev : [...prev, topic.parent];
            });
        }
    }

    return {
        selectTopic, unselectTopic, selectSubTopic, unselectSubTopic,
        selectedTopics, unselectedTopics, selectedSubTopics, unselectedSubTopics, localFilters
    }
}