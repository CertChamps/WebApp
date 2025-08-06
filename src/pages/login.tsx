import { useState } from 'react'
import crown from '../assets/crown.png'
import useAuthentication from '../hooks/useAuthentication'

export default function Login() {

    // ====================================== REACT HOOKS =================================== //
    const { signInWithEmail, signUpWithEmail, loginWithGoogle } = useAuthentication()
    const [email, setEmail] = useState()
    const [password, setPassword] = useState()
    const [username, setUsername] = useState()

    return (
        <div className=' h-full flex justify-center items-center ' >
            <div className=' h-11/12 w-72 shadow-xl rounded-out border-light-grey border' >
                <img src={crown}  className='w-34 m-auto'/>
                <h1 className="txt-heading-colour text-center" >Log In</h1>
                <input type="email" placeholder="email" className="txtbox mx-auto my-2 w-9/12" 
                    onChange={(txt:any) => {setEmail(txt)}}/>
                <input type="password" placeholder="password" className="txtbox mx-auto my-2 w-9/12" 
                    onChange={(txt:any) => {setPassword(txt)}}/>
                <input type="text" placeholder="username" className="txtbox mx-auto my-2 w-9/12" 
                    onChange={(txt:any) => {setUsername(txt)}}/>

                <p className= "blue-btn mx-auto my-2 w-9/12"
                     onClick={() => {signInWithEmail(email ?? '', password ?? '')}}>Login</p>
                <p className= "blue-btn mx-auto my-2 w-9/12"
                     onClick={() => {signUpWithEmail(email ?? '', username ?? '',  password ?? '')}}>Sign Up</p>
                <p className= "red-btn mx-auto my-2 w-9/12"
                     onClick={() => {loginWithGoogle()}}>Google</p>
            </div>
        </div>
    )
}