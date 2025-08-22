import { useState, useRef, useEffect } from "react";
import useMaths from "../hooks/useMaths";
import "mathlive"

export default function MathInput() {

    const [value, setValue] = useState("");
    const { isCorrect } = useMaths();
    const mathFieldRef = useRef<any>(null);
    
    useEffect(() => {
        if (mathFieldRef.current) {
            mathFieldRef.current.value = value;
        }
    }, [value]);


    return (
        <div>
        <math-field
        ref={mathFieldRef}  
        onInput={(evt: any) => setValue(evt.target.value)}
        className="txtbox outline-none bg-none text-grey inline-block dark:text-light-grey
            focus:border-3 border-blue dark:border-blue-light w-50 mx-4 shadow-blue dark:shadow-blue-light 
            h-10 overflow-scroll"
        style={{
            background: "none", 
            outline: "none",
            fontSize: 24
        }} >
            {value}
        </math-field>
        <p>{value}</p>
        <p>{ isCorrect(value) }</p>
        </div>
    )

}