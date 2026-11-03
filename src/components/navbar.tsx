import { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LuLogIn, LuSearch, LuPencil, LuCrown } from "react-icons/lu";
import { auth } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { signInPath } from "../lib/signIn";
import { hasAceAccess } from "../lib/contentAccess";
import NotificationBell from "./social/NotificationBell";
import "../styles/navbar.css";

export default function Navbar() {
  const { user, authReady } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = authReady && !!auth.currentUser && user?.uid === auth.currentUser.uid;
  const backTo = location.pathname + location.search;
  const profilePath = signedIn ? `/viewProfile/${user.uid}` : signInPath("your account", backTo);

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
        <button type="button" className="app-topnav__profile" onClick={() => navigate(profilePath, { state: { backTo } })} aria-label={signedIn ? "Profile" : "Sign in"}>
          {signedIn && user.picture ? <img src={user.picture} alt="" /> : <LuLogIn size={20} aria-hidden />}
        </button>
      </div>
    </header>
  );
}
