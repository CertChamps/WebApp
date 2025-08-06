import { useState } from "react";
import { UserContext} from "./context/UserContext";
import AppRouter from "./Router";

export default function App() {

  const [user, setUser] = useState<any>()

  return (
    <UserContext.Provider value={{user, setUser}} >
      <div className=" bg-white dark:bg-black h-screen w-screen p-5"  >
        <AppRouter/>
      </div>
    </UserContext.Provider>
  )
}
