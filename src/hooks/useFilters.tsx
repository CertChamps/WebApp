import { useState } from "react";

export default function useFilters() {

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
    ])
    const [ selectedTopics, setSelectedTopics ] = useState<{key: number, topic: string, subTopics: string[]}[]>([])
    const [ unselectedSubTopics, setUnselectedSubTopics  ] = useState<{parent: string, key: number, topic: string}[]>([])
    const [ selectedSubTopics, setSelectedSubTopics  ] = useState<{parent: string, key: number, topic: string}[]>([])

    const [ localFilters, setLocalFilters ] = useState<string[]>([])


    // ============================================== SELECTING TOPICS ================================================= // 
    const selectTopic = (topic: {key: number, topic: string, subTopics: string[]}) => {

        setSelectedTopics(topics => [...topics, topic]) // selects the topic 
        setUnselectedTopics(topics => topics.filter(tpc => tpc !== topic)) // removes topic from unselected
        // Add subtopics to list
        topic.subTopics.forEach( sub => {
            setUnselectedSubTopics(topics => [...topics, {parent: topic.topic, key: Math.floor(Math.random() * 500), topic: sub}])
        })
        // add topic to filter 
        setLocalFilters(filters => [...filters, topic.topic])

    }
    // =============================================================================================================== //

    // ============================================= UNSELECTING TOPICS ================================================= // 
    const unselectTopic = (topic: {key: number, topic: string, subTopics: string[]}) => {

        setUnselectedTopics(topics => [...topics, topic]) // unselects the topic 
        setSelectedTopics(topics => topics.filter(tpc => tpc !== topic))  // removes topic from selected
        // Dealing with subtopics...
        topic.subTopics.forEach( sub => {
            setUnselectedSubTopics(topics => topics.filter(tpc => tpc.topic !== sub))
            setSelectedSubTopics(topics => topics.filter(tpc => tpc.topic !== sub))
            setLocalFilters(filters => filters.filter(tpc => tpc !== sub))
        })
        setLocalFilters(filters => filters.filter(tpc => tpc !== topic.topic))

    }
    // =============================================================================================================== //

    // ============================================= SELECTING SUBTOPICS ============================================ // 

    const selectSubTopic = (topic: { parent: string, key: number, topic: string}) => {
        setSelectedSubTopics(topics => [...topics, topic])
        setUnselectedSubTopics(topics => topics.filter(tpc => tpc !== topic))
        setLocalFilters(filters => [...filters, topic.topic])
        setLocalFilters(filters => filters.filter(tpc => tpc !== topic.parent))
    }
    // =============================================================================================================== //

    // ============================================= UNSELECTING SUBTOPICS ================================================= // 
    const unselectSubTopic = (topic: {parent: string, key: number, topic: string}) => {
        setUnselectedSubTopics(topics => [...topics, topic])
        setSelectedSubTopics(topics => topics.filter(tpc => tpc !== topic))
        setLocalFilters(filters => filters.filter(tpc => tpc !== topic.topic))
        // checking fo 
        let empty = true
        unselectedSubTopics.forEach(sub => { 
            if ( sub.parent === topic.parent ) empty = false 
        } )

        if ( empty ) 
            setLocalFilters(filters => [...filters, topic.parent])
    }
    // =============================================================================================================== //

    return {
        selectTopic, unselectTopic, selectSubTopic, unselectSubTopic,
        selectedTopics, unselectedTopics, selectedSubTopics, unselectedSubTopics, localFilters
    }
}