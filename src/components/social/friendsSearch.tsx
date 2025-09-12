// FriendsSearch.tsx
import { LuBell, LuSearch } from "react-icons/lu";
import loadingAnim from '../../assets/animations/loading.json';
import '../../styles/social.css';

import { useState, useEffect, useRef, useContext } from "react";
import useFriends from "../../hooks/useFriends";
import Lottie from 'lottie-react';
import Notifications from "./notifications";
import { UserContext } from "../../context/UserContext";

export default function FriendsSearch() {
  const { getSearch, sendFriendRequest } = useFriends();
  const { user } = useContext(UserContext)

  const [search, setSearch] = useState<string>('');
  const [usersFound, setUsersFound] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [viewSearch, setViewSearch] = useState<boolean>(false);
  const [viewNoti, setViewNoti] = useState<boolean>(false);

  // ref for the whole search area (input + dropdown + bell + noti)
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Run search when `search` changes
  useEffect(() => {
    const runSearch = async () => {
      if (search.length > 0) {
        setLoading(true);
        const result = await getSearch(search);
        setUsersFound(result ?? []);
        setLoading(false);
      } else {
        // clear results when search is empty
        setUsersFound([]);
      }
    };

    runSearch();
  }, [search]);

  // Close dropdowns when clicking or focusing outside the component
  useEffect(() => {
    function handleOutside(e: MouseEvent | FocusEvent) {
      const target = e.target as Node | null;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setViewSearch(false);
        setViewNoti(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    // also handle keyboard focus changes
    document.addEventListener('focusin', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('focusin', handleOutside);
    };
  }, []);

  const onBellClick = () => {
    // toggle notifications; ensure search is closed
    setViewNoti(prev => !prev);
    setViewSearch(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* SEARCH INPUT */}
      <div className="flex items-center w-full color-bg">
        <div className="flex items-center txtbox w-full color-bg">
          <input
            type="text"
            placeholder="Add friends +"
            className="w-full p-1 outline-none border-none"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setSearch(e.target.value);
            }}
            onFocus={() => {
              setViewSearch(true);
              setViewNoti(false);
            }}
            value={search}
            aria-label="Search friends"
            aria-controls="friends-search-dropdown"
            aria-expanded={viewSearch}
          />

          <LuSearch className="color-txt-sub" size={24} />
        </div>
        <button
          type="button"
          onClick={onBellClick}
          aria-label="Notifications"
          aria-expanded={viewNoti}
          aria-controls="notifications-dropdown"
          className="focus:outline-none relative"
        > 
          { user.notifications.length > 0 ?
           <div className="bg-red w-2 h-2 rounded-full absolute top-0 right-4"></div> 
           : <></> }
          
          <LuBell className="color-txt-sub mx-4" strokeWidth={3} size={24} />
        </button>
      </div>

      {/* ==================================== DROPDOWN SEARCH =================================================== */}
      <div
        id="friends-search-dropdown"
        className={viewSearch ? "search-box-shown" : "search-box-hidden"}
      >
        {search.length <= 0 ? (
          <div className="flex-col w-h-container">
            <LuSearch size={64} strokeWidth={1} className="color-txt-sub" />
            <span className="txt-heading color-txt-sub">Search Friends</span>
          </div>
        ) : !loading ? (
          <div>
            {usersFound?.length > 0 ? (
              usersFound.map((user: any) => (
                <div
                  key={user.uid ?? user.username}
                  className="m-4 flex items-center gap-4"
                >
                  <img
                    src={user.picture}
                    alt={user.username || 'user'}
                    className="w-10 h-10 rounded-full object-cover"
                  />

                  <span className="txt-bold">{user.username}</span>

                  <button
                    type="button"
                    className="ml-auto blue-btn cursor-pointer"
                    onClick={() => {
                      sendFriendRequest(user.username);
                      setSearch('');
                      setViewSearch(false); // optionally close after sending
                    }}
                  >
                    Send Request
                  </button>
                </div>
              ))
            ) : (
              <div className="w-h-container p-4">
                <p className="txt-heading color-txt-sub">No Results</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex justify-center items-center">
            <Lottie
              animationData={loadingAnim}
              loop
              autoplay
              className="h-40 w-40"
            />
          </div>
        )}
      </div>

      {/* ==================================== DROPDOWN NOTI =================================================== */}
      <div
        id="notifications-dropdown"
        className={viewNoti ? "search-box-shown" : "search-box-hidden"}
      >
        <Notifications />
      </div>
    </div>
  );
}