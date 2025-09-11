// SearchandFilter.tsx
import useFilters from '../hooks/useFilters';

// Styles & Icons
import { HiOutlineX } from "react-icons/hi";
import { LuSearch, LuFilter } from "react-icons/lu";
import '../styles/filters.css';
import { useEffect, useRef, useState } from 'react';


type filterProps = {
  setFilters: React.Dispatch<React.SetStateAction<any>>;
}
export default function SearchandFilter(props: filterProps) {
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

  const [viewFilter, setViewFilter] = useState<boolean>(false);

  // applying filters 
  const applyFilter = () => {
    props.setFilters(localFilters);
    setViewFilter(false);
  } 
  

  // ref for the whole search + filter area (input + dropdown)
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking or focusing outside the component
  useEffect(() => {
    function handleOutside(e: MouseEvent | FocusEvent) {
      const target = e.target as Node | null;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setViewFilter(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('focusin', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('focusin', handleOutside);
    };
  }, []);

  // Set filters 

  return (
    <div ref={containerRef}>
      {/* ======================================== SEARCH AND FILTER ========================================== */}
      <div className="flex items-center gap-3 w-full color-bg relative">
        <div className="flex items-center txtbox w-full max-w-xs color-bg">
          <input
            type="text"
            placeholder="Search Questions"
            className="w-full p-1 outline-none border-none"
          />
          <LuSearch className="color-txt-sub" size={24} />
        </div>

        <button
          type="button"
          className="px-1"
          onClick={() => setViewFilter((v) => !v)}
        >
          <LuFilter
            className="color-txt-sub mx-4"
            size={30}
            fill={ viewFilter ? 'currentColor' : 'none'}
          />
        </button>

        {/* DROPDOWN */}
        <div className={viewFilter ? 'filter-container-shown' : 'filter-container-hidden'}>
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
              select a topic to see subtopics <br /> (actual filtering in
              progress)
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
    </div>
  );
}