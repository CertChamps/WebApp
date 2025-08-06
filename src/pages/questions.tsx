import { useContext } from "react"
import { UserContext } from "../context/UserContext"

export default function Questions() {

    const {user} = useContext(UserContext)
    return (
        <div>
            <p>Questions</p>
            <p className="txt-heading-colour">Default Text</p>
            <p className="txt-heading">Default Text</p>
            <p className="txt-bold">Default Text</p>
            <p className="txt">Default Text</p>
            <p className="txt-sub">Default Text</p>
            <input type="text" className="txtbox txt" placeholder="Default Text" />
            <button className=" block blue-btn m-2 " >
                <p>Default Text</p>
            </button>
            <button className=" block plain-btn m-2 " >
                <p>Default Text</p>
            </button>
            <button className=" block red-btn m-2" >
                <p>Default Text</p>
            </button>

            <p>{user.email}</p>
            <p>{user.uid}</p>
            <p>{user.username}</p>

        </div>
    )
}