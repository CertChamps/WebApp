import { LuSearch, LuFilter } from "react-icons/lu";
import RenderMath from "../components/mathdisplay";
import { useState } from "react";

export default function Questions() {
    const [index, setIndex] = useState(0);
    const [latex, setLatex] = useState<string>('');

    const questions = [
        "In $\\triangle PQR$, $P(0, 0)$, $Q(8, 0)$, and $R(4, h)$. If the orthocentre is at $(4, 2)$, find $h$.",
        "A point $P(x,y)$ moves such that its distance to line $3x - 4y + 1 = 0$ is twice its distance to line $6x - 8y - 3 = 0$. Show that $P$ lies on one of two lines and find their equations.",
        "In a right triangle, the lengths of the legs are $a$ and $b$. If the area is $A$, find the relationship between $A$, $a$, and $b$.",
        "Line $l: kx - 3y + 4 = 0$ makes angle $\\theta$ with $3x - y + 2 = 0$ where $\\tan\\theta = \\frac{1}{2}$. Find $k$."
    ];
    return (
        <div className="w-full h-full flex flex-col justify-items-center p-4">

            <div className="flex items-center justify-center w-full ">
                <div className="flex items-center justify-between txtbox w-9/12 max-w-xs">
                    <input type="text" placeholder="Search Questions" className=" txtbox w-full outline-none border-none"/>
                    <LuSearch className="text-grey dark:text-light-grey" size={24}/>
                </div>

                <LuFilter className="text-grey dark:text-light-grey m-4"  size={24}/>
            </div>

            <div className="h-[90%] w-[97.5%] bg-grey/5 dark:bg--light-grey/10 rounded-out m-auto border-2 p-8
             border-light-grey dark:border-grey shadow-xl">
                <p  className="txt-sub italic" >#Tags for the questions</p>
                <p className="txt" >Wow so much space I actually dont know what to do with myself here</p>
                <input type="text" className="txtbox w-full max-w-xs" placeholder="Answer" onChange={(e: any) => setLatex(e.target.value)} />
                <RenderMath text={latex} className="txt" />
                <RenderMath text={questions[index]} className="txt" />
                <p className="plain-btn m-4 cursor-pointer" onClick={() => setIndex((index + 1) % questions.length)}>Next Questions</p>
            </div>

        </div>
    )
}