import React,{ createContext } from "react";

// ======================== OPTIONS TYPE =========================== // 
export type OptionsType = {
    options: {
        theme: string
        drawingEnabled: boolean
        // future options and preference will be saved here
    },
    setOptions: React.Dispatch<React.SetStateAction<any>>
}


// ======================== OPTIONS CONTEXT  =========================== //
export const OptionsContext = createContext<OptionsType>({
    options: {
        theme: 'light',
        drawingEnabled: true
    }, 
    setOptions: () => {}
})