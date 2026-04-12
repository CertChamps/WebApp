import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { UserContext } from "./context/UserContext";
import { OptionsContext } from "./context/OptionsContext";
import { TutorialProvider } from "./context/TutorialContext";
import AppRouter from "./Router";
import UsernamePrompt from "./components/prompts/username_prompt";
import ReleaseNotesPrompt from "./components/prompts/release_notes_prompt";
//import CustomCursor from "./components/CustomCursor"

export default function App() {
  // =================== CONTEXT SETUP ===================== //
  const [user, setUser] = useState<any>(() => {
    const storedUser = localStorage.getItem("USER");
    return storedUser ? JSON.parse(storedUser) : {}; // default empty object
  });

  const [options, setOptions] = useState<any>(() => {
    const storedOptions = localStorage.getItem("OPTIONS");
    const parsed = storedOptions ? JSON.parse(storedOptions) : {};
    return { theme: "light", drawingEnabled: true, laptopMode: false, leftHandMode: false, ...parsed };
  });

  // ===================== PERSISTENCE ====================== //
  useEffect(() => {
    localStorage.setItem("USER", JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem("OPTIONS", JSON.stringify(options));
  }, [options]);

  // Native shell UX controls (Android back handling + touch-safe viewport)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.classList.add("capacitor-native");

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewportMeta?.getAttribute("content") ?? "";
    if (viewportMeta) {
      viewportMeta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no"
      );
    }

    let removeBackHandler: (() => Promise<void>) | null = null;
    void import("@capacitor/app").then(async ({ App }) => {
      const listener = await App.addListener("backButton", async ({ canGoBack }) => {
        if (canGoBack || window.history.length > 1) {
          window.history.back();
          return;
        }
        try {
          await App.minimizeApp();
        } catch {
          await App.exitApp();
        }
      });
      removeBackHandler = () => listener.remove();
    });

    return () => {
      document.documentElement.classList.remove("capacitor-native");
      if (viewportMeta) {
        viewportMeta.setAttribute("content", previousViewport);
      }
      if (removeBackHandler) {
        void removeBackHandler();
      }
    };
  }, []);
 
  return (
    // ================ CONTEXT PROVIDERS ===================== //
    <OptionsContext.Provider value={{ options, setOptions }}>
      <UserContext.Provider value={{ user, setUser }}>
        <TutorialProvider>
          {/* // ================ DIV THEME WRAPPER ===================== // */}
          <div id="themed-root" data-theme={options.theme}>
            <div className="color-bg h-screen w-screen flex flex-row">
              {/* <CustomCursor /> */}
              <AppRouter />
              <UsernamePrompt />
              <ReleaseNotesPrompt />
            </div>
          </div>
        </TutorialProvider>
      </UserContext.Provider>
    </OptionsContext.Provider>
  );
}
