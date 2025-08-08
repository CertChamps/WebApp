import { LuSearch, LuFilter } from "react-icons/lu";


export default function Questions() {
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
                <input type="text" className="txtbox w-full max-w-xs" placeholder="Answer"/>
                
            </div>

        </div>
    )
}