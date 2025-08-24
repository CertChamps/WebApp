import { useEffect, useState } from "react";
import { UserContext} from "./context/UserContext";
import { OptionsContext } from "./context/OptionsContext";
import AppRouter from "./Router";


export default function App() {

  // =================== CONTEXT SETUP ===================== //
  const [user, setUser] = useState<any>({})
  const [options, setOptions] = useState<any>({
    theme: 'light'
  })

  // ===================== THEME SETUP ====================== // 
  useEffect(() => {

    // Initialising options 
    const initOptions = () => {

      // Retreiving preferences from local storage
      const theme = localStorage.getItem('THEME')

      // Apply context
      setOptions({theme})
    }

    // Run the function on first render
    initOptions()

  }, [])

  return (
    // ================ CONTEXT PROVIDERS ===================== //
    <OptionsContext.Provider value={{options , setOptions}}>
    <UserContext.Provider value={{user, setUser}} >
        
      {/* // ================ DIV THEME WRAPPER ===================== // */}
      <div data-theme={options.theme}>
        <div className={`color-bg h-screen w-screen flex flex-row`} >

          <AppRouter/>

        </div>
      </div>
    </UserContext.Provider>
    </OptionsContext.Provider>
  )
}
