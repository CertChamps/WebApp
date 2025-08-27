import { useState } from 'react'
import crown from '../assets/crown.png'
import useAuthentication from '../hooks/useAuthentication'

export default function Login() {

    // ====================================== REACT HOOKS =================================== //
    const { signInWithEmail, signUpWithEmail, loginWithGoogle } = useAuthentication()
    const [email, setEmail] = useState<string>()
    const [password, setPassword] = useState<string>()
    const [username, setUsername] = useState<string>()

    return (
        <div className=' h-full flex justify-center items-center w-full' >
            <div className=' h-11/12 w-72 shadow-small rounded-out border-3 ' >
                <img src={crown}  className='w-34 m-auto'/>
                <h1 className="txt-heading-colour text-center" >Log In</h1>
                <input type="text" placeholder="email" className="txtbox mx-auto my-2 w-9/12" 
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setEmail(txt.target.value); console.log(txt.target.value)}}/>

                <input type="password" placeholder="password" className="txtbox mx-auto my-2 w-9/12" 
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setPassword(txt.target.value)}}/>

                <input type="text" placeholder="username" className="txtbox mx-auto my-2 w-9/12" 
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setUsername(txt.target.value)}}/>

                <p className= "blue-btn mx-auto my-2 w-9/12 text-center"
                     onClick={() => {signInWithEmail(email ?? '', password ?? '')}}>Login</p>
                <p className= "blue-btn mx-auto my-2 w-9/12 text-center"
                     onClick={() => {signUpWithEmail( username ?? '', email ?? '', password ?? '')}}>Sign Up</p>
                <p className= "red-btn mx-auto my-2 w-9/12 text-center"
                     onClick={() => {loginWithGoogle()}}>Google</p>
            </div>
        </div>
    )
}