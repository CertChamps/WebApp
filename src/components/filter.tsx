// SearchandFilter.tsx
import useFilters from '../hooks/useFilters';

// Styles & Icons
import { HiOutlineX } from "react-icons/hi";
import '../styles/filters.css';
import { useEffect, useRef } from 'react';

type filterProps = {
  setFilters: React.Dispatch<React.SetStateAction<any>>,
  viewFilter: boolean,
  setViewFilter: React.Dispatch<React.SetStateAction<any>>
}

export default function Filter(props: filterProps) {
  const {
    selectTopic,
    unselectTopic,
    selectSubTopic,
    unselectSubTopic,
    selectedTopics,
    unselectedTopics, 
    selectedSubTopics,
    unselectedSubTopics,
    localFilters,
  } = useFilters();

  // ref for the whole search + filter area (input + dropdown)
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside the component
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node | null;
      // Only close if clicking outside the filter container
      if (containerRef.current && !containerRef.current.contains(target)) {
        props.setViewFilter(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [props.setViewFilter]);

  // Remove the focusin event listener as it's causing issues with filter interactions

  // applying filters 
  const applyFilter = () => {
    props.setFilters(localFilters);
    props.setViewFilter(false);
  } 
  
  // Set filters 

  return (
    <div ref={containerRef}>
        {/* DROPDOWN (or dropup in this case haha) */}
        <div className={props.viewFilter ? 'filter-container-shown' : 'filter-container-hidden'}>
          <p className="filter-header">topic</p>
          <div className="selection-container">
            {selectedTopics.map((topic) => (
              <div
                onClick={() => unselectTopic(topic)}
                className="selected"
                key={topic.topic}
              >
                <span>{topic.topic}</span>
                <HiOutlineX size={12} strokeWidth={3} className="mx-0.5" />
              </div>
            ))}
            {unselectedTopics.map((topic) => (
              <div
                onClick={() => selectTopic(topic)}
                className="unselected"
                key={topic.topic}
              >
                <span>{topic.topic}</span>
              </div>
            ))}
          </div>

          <p className="filter-header">subtopic</p>
          {(selectedSubTopics.length > 0 || unselectedSubTopics.length > 0) ? (
            <div className="selection-container">
              {selectedSubTopics.map((topic) => (
                <div
                  onClick={() => unselectSubTopic(topic)}
                  className="selected"
                  key={topic.topic}
                >
                  <span>{topic.topic}</span>
                  <HiOutlineX size={12} strokeWidth={3} className="mx-0.5" />
                </div>
              ))}
              {unselectedSubTopics.map((topic) => (
                <div
                  onClick={() => selectSubTopic(topic)}
                  className="unselected"
                  key={topic.topic}
                >
                  <span>{topic.topic}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="filler">
              select a topic to see subtopics <br /> 
            </p>
          )}

          <p
            className="apply"
            onClick={() => {
              applyFilter()
            }}
          >
            Apply
          </p>
        </div>
      </div>
  );
}