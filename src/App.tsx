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
    const initOptions = async () => {

      // Retreiving preferences from local storage
      const theme = await localStorage.getItem('THEME')

      // Apply context
      setOptions({theme})
    }

    // Run the function on first render
    initOptions()

  }, [])

  return (
    <OptionsContext.Provider value={{options , setOptions}}>
    <UserContext.Provider value={{user, setUser}} >
      <div className={`${ options.theme == 'dark' ? 'dark' : ''} bg-white dark:bg-black h-screen w-screen p-5`}  >
        <AppRouter/>
      </div>
    </UserContext.Provider>
    </OptionsContext.Provider>
  )
}
