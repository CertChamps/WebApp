import { useEffect, useState } from "react";
import { UserContext } from "./context/UserContext";
import { OptionsContext } from "./context/OptionsContext";
import { TutorialProvider } from "./context/TutorialContext";
import AppRouter from "./Router";
import UsernamePrompt from "./components/prompts/username_prompt";
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
            </div>
          </div>
        </TutorialProvider>
      </UserContext.Provider>
    </OptionsContext.Provider>
  );
}
