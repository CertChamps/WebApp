import { useState, useRef, useEffect } from "react";
import RenderMath from "../components/math/mathdisplay";

export default function Social() {
    const [value, setValue] = useState("");
    const mathFieldRef = useRef<any>(null);
    
        useEffect(() => {
            if (mathFieldRef.current) {
                mathFieldRef.current.value = value;
            }
        }, [value]);
    
        const [index, setIndex] = useState(0);
        const [latex, setLatex] = useState<string>('');
    
        const questions = [
            "In $\\triangle PQR$, $P(0, 0)$, $Q(8, 0)$, and $R(4, h)$. If the orthocentre is at $(4, 2)$, find $h$.",
            "A point $P(x,y)$ moves such that its distance to line $3x - 4y + 1 = 0$ is twice its distance to line $6x - 8y - 3 = 0$. Show that $P$ lies on one of two lines and find their equations.",
            "In a right triangle, the lengths of the legs are $a$ and $b$. If the area is $A$, find the relationship between $A$, $a$, and $b$.",
            "Line $l: kx - 3y + 4 = 0$ makes angle $\\theta$ with $3x - y + 2 = 0$ where $\\tan\\theta = \\frac{1}{2}$. Find $k$."
        ];
    return (
        <div>
            <p>Social</p>
                         <p  className="txt-sub italic" >#Tags for the questions</p>
                <p className="txt" >Wow so much space I actually dont know what to do with myself here</p>
                <input type="text" className="txtbox w-full max-w-xs" placeholder="Answer"/>
                   <math-field
                ref={mathFieldRef}
                onInput={(evt: any) => setValue(evt.target.value)}
                style={{
                    display: "block",
                    minHeight: "60px",
                    padding: "8px",
                    backgroundColor: "#f0f0f0",
                    border: "2px solid #888",
                    borderRadius: "8px",
                    fontSize: "18px",
                    color: "black"
                }}
            >
                {value}
            </math-field>
            <p>Value: {value}</p>
                <input type="text" className="txtbox w-full max-w-xs" placeholder="Answer" onChange={(e: any) => setLatex(e.target.value)} />
                <RenderMath text={latex} className="txt" />
                <RenderMath text={questions[index]} className="txt" />
                <p className="plain-btn m-4 cursor-pointer" onClick={() => setIndex((index + 1) % questions.length)}>Next Questions</p>
        </div>
    )
}