import { useState, useRef, useEffect } from "react";
import "mathlive"

export default function MathInput() {

    const [value, setValue] = useState("");
    const mathFieldRef = useRef<any>(null);
    
    useEffect(() => {
        if (mathFieldRef.current) {
            mathFieldRef.current.value = value;
        }
    }, [value]);


    return (
        <math-field
        ref={mathFieldRef}  
        onInput={(evt: any) => setValue(evt.target.value)}
        className="txtbox outline-none bg-none text-grey inline-block dark:text-light-grey
            focus:border-3 border-blue dark:border-blue-light mx-2 w-50 "
        style={{
            background: "none", 
            outline: "none",
            fontSize: 24
        }} >
            {value}
        </math-field>
    )

}