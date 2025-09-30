import { useEffect, useState } from 'react'
import crown from '../assets/crown.png'
import { FaGoogle } from 'react-icons/fa'
import useAuthentication from '../hooks/useAuthentication'
import { useNavigate } from 'react-router-dom'
import { useLocation } from 'react-router-dom'

export default function SignUp() {

    // ====================================== REACT HOOKS =================================== //
    const navigate = useNavigate()

    const location = useLocation()
    const prevRoute = location.state?.prevRoute
    useEffect(() => {
    console.log("Previous Route: ", prevRoute) 
    }, [prevRoute])

    const {signUpWithEmail, loginWithGoogle, error } = useAuthentication({ prevRoute })
    const [email, setEmail] = useState<string>()
    const [password, setPassword] = useState<string>()
    const [username, setUsername] = useState<string>()


    const heading_style = "txt-sub text-xs font-bold w-9/12 mx-auto mb-1"

    return (
        <div className=' h-full flex justify-center items-center w-full color-bg-grey-5' >
            <div className=' py-8 w-72 h-10/12 color-shadow border-2 rounded-out color-bg' >
                <img src={crown}  className='w-34 m-auto object-cover h-24 mb-4'/>
                <h1 className="txt-heading-colour text-center text-2xl mb-4" >Sign Up</h1>

                <p className='font-light text-red ml-0.5 text-center'>{error?.general ? error.general : ""}</p>


                <p className={heading_style}>username 
                    <span className='font-light text-red ml-1'>{error?.username ? error.username : ""}</span></p>
                <input type="text" placeholder="username" className="txtbox mx-auto mb-2 w-9/12" 
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setUsername(txt.target.value)}}/>

                <p className={heading_style}>email
                    <span className='font-light text-red ml-1'>{error?.email ? error.email : ""}</span>
                </p>
                <input type="text" placeholder="email" className="txtbox mx-auto mb-2 w-9/12" 
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setEmail(txt.target.value); console.log(txt.target.value)}}/>

                <p className={heading_style}>password
                    <span className='font-light text-red ml-1'>{error?.password ? error.password : ""}</span>
                </p>
                <input type="password" placeholder="password" className="txtbox mx-auto mb-4 w-9/12" 
                    onChange={(txt:React.ChangeEvent<HTMLInputElement>) => {setPassword(txt.target.value)}}/>



                <p className= "blue-btn mx-auto my-2 w-9/12 text-center"
                     onClick={() => {signUpWithEmail( username ?? '', email ?? '', password ?? '')}}>Sign Up</p>
                     
                <div className= "red-btn mx-auto my-2 w-9/12 text-center bg-[#4C8BF5] flex justify-center items-center" >  
                    <FaGoogle className='mr-2 text-white' size={17}/>
                    <p  onClick={() => {loginWithGoogle()}}>Sign Up With Google</p>
                </div>

                <p className='txt-sub text-center hover:color-txt-accent duration-250 transition-all' onClick={() => {
                    navigate('./login')
                }}>Already have an account? <span className="underline">Login here.</span></p>
               
            </div>
        </div>
    )
}