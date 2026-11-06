import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LuLogIn, LuLogOut, LuSearch, LuPencil, LuCrown, LuUserRound, LuSettings, LuPalette, LuGauge, LuCircleHelp, LuMessageCircle, LuShieldCheck } from "react-icons/lu";
import { auth } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { signInPath } from "../lib/signIn";
import { hasAceAccess } from "../lib/contentAccess";
import { signOutSession } from "../lib/authSession";
import NotificationBell from "./social/NotificationBell";
import { isAdminUid } from "../constants/adminUids";
import "../styles/navbar.css";

export default function Navbar() {
  const { user, setUser, authReady } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const signedIn = authReady && !!auth.currentUser && user?.uid === auth.currentUser.uid;
  const backTo = location.pathname + location.search;
  const profilePath = signedIn ? `/viewProfile/${user.uid}` : signInPath("your account", backTo);
  const isAdmin = isAdminUid(user?.uid, user?.email);

  useEffect(() => { setProfileOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!profileOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);

  const logOut = async () => {
    setSigningOut(true);
    try {
      await signOutSession();
      setUser(null);
      setProfileOpen(false);
      navigate("/login", { replace: true, state: null });
    } catch (error) {
      console.error("Log out failed:", error);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header id="app-navbar" className="app-topnav color-bg">
      <div className="app-topnav__spacer" aria-hidden />

      <nav className="app-topnav__links" aria-label="Main navigation">
        <button type="button" className={location.pathname.startsWith("/practice") || location.pathname.startsWith("/whiteboards") ? "is-active" : ""} onClick={() => navigate("/practice")}>
          <LuPencil size={17} aria-hidden /> Practice
        </button>
        <button type="button" className={location.pathname.startsWith("/discover") ? "is-active" : ""} onClick={() => navigate("/discover")}>
          <LuSearch size={17} aria-hidden /> Discover
        </button>
      </nav>

      <div className="app-topnav__actions">
        {!hasAceAccess(user) && (
          <button type="button" className="app-topnav__upgrade" onClick={() => navigate("/user/manage-account?tab=payments", { state: { backTo } })}>
            <LuCrown size={16} aria-hidden /> Upgrade to ACE
          </button>
        )}
        {signedIn && <NotificationBell />}
        <div className="app-topnav__profile-wrap" ref={profileMenuRef}>
          <button type="button" className="app-topnav__profile" onClick={() => signedIn ? setProfileOpen((open) => !open) : navigate(profilePath, { state: { backTo } })} aria-label={signedIn ? "Account menu" : "Sign in"} aria-haspopup={signedIn ? "menu" : undefined} aria-expanded={signedIn ? profileOpen : undefined}>
            {signedIn && user.picture ? <img src={user.picture} alt="" /> : <LuLogIn size={20} aria-hidden />}
          </button>
          {signedIn && profileOpen && (
            <nav className="app-topnav__profile-menu color-bg" aria-label="Account">
              <button type="button" onClick={() => { setProfileOpen(false); navigate(profilePath); }}><LuUserRound aria-hidden /> My profile</button>
              <button type="button" onClick={() => { setProfileOpen(false); navigate("/user/settings"); }}><LuSettings aria-hidden /> Settings</button>
              <button type="button" onClick={() => { setProfileOpen(false); navigate("/user/themes"); }}><LuPalette aria-hidden /> Themes</button>
              {isAdmin && <button type="button" onClick={() => { setProfileOpen(false); navigate("/admin"); }}><LuShieldCheck aria-hidden /> Admin dashboard</button>}
              <div className="app-topnav__menu-divider" aria-hidden />
              <button type="button" disabled={signingOut} onClick={() => void logOut()}><LuLogOut aria-hidden /> {signingOut ? "Signing out…" : "Log out"}</button>
              <div className="app-topnav__menu-divider" aria-hidden />
              <button type="button" onClick={() => { setProfileOpen(false); navigate("/user/usage"); }}><LuGauge aria-hidden /> Usage &amp; limits</button>
              <button type="button" onClick={() => { setProfileOpen(false); navigate("/user/help"); }}><LuCircleHelp aria-hidden /> Help</button>
              <button type="button" onClick={() => { setProfileOpen(false); navigate("/feedback"); }}><LuMessageCircle aria-hidden /> Feedback</button>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
