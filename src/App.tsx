import { useEffect, useState } from "react";
import { UserContext } from "./context/UserContext";
import { OptionsContext } from "./context/OptionsContext";
import AppRouter from "./Router";
import CustomCursor from "./components/CustomCursor"

export default function App() {
  // =================== CONTEXT SETUP ===================== //
  const [user, setUser] = useState<any>(() => {
    const storedUser = localStorage.getItem("USER");
    return storedUser ? JSON.parse(storedUser) : {}; // default empty object
  });

  const [options, setOptions] = useState<any>(() => {
    const storedOptions = localStorage.getItem("OPTIONS");
    return storedOptions ? JSON.parse(storedOptions) : { theme: "light" };
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
        {/* // ================ DIV THEME WRAPPER ===================== // */}
        <div id="themed-root" data-theme={options.theme}>
          <div className="color-bg h-screen w-screen flex flex-row">
            {/* <CustomCursor /> */}
            <AppRouter />
          </div>
        </div>
      </UserContext.Provider>
    </OptionsContext.Provider>
  );
}
