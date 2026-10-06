import { useState } from 'react'
import crown from '../assets/logo.png'
import { FaGoogle, FaApple } from 'react-icons/fa'
import useAuthentication from '../hooks/useAuthentication'
import { useLocation, useNavigate } from 'react-router-dom'
import { LuArrowLeft } from 'react-icons/lu'
import { signInDetails } from '../lib/signIn'

export default function Login() {

    // ====================================== REACT HOOKS =================================== //
    const navigate = useNavigate()
    const location = useLocation()
    const { feature, returnTo, back, showBack } = signInDetails(location.search, location.state)
    

    const {signInWithEmail, loginWithGoogle, loginWithApple, error } = useAuthentication({ prevRoute: returnTo })
    const [email, setEmail] = useState<string>()
    const [password, setPassword] = useState<string>()

    const heading_style = "txt-sub text-xs font-bold w-9/12 mx-auto mb-1"

    return (
        <div className='relative h-full flex flex-col items-center w-full color-bg-grey-5 overflow-y-auto px-4 py-16' >
            {showBack && <button type="button" onClick={() => navigate(back.path, { replace: true })}
                className="absolute top-4 left-4 inline-flex items-center gap-2 text-sm font-semibold color-txt-sub hover:color-txt-main">
                <LuArrowLeft size={18} /> Back to {back.label}
            </button>}
            <div className='my-auto shrink-0 py-8 w-72 color-shadow border-2 rounded-out color-bg' >
                <img src={crown}  className='w-32 m-auto object-cover h-24'/>
                <h1 className="txt-heading-colour text-center text-2xl mb-4" >Login</h1>
                {feature && <p className="px-6 mb-4 text-sm text-center color-txt-sub" role="status">Sign-in required for {feature}.</p>}

                <p className='font-light text-red ml-0.5 text-center'>{error?.general ? error.general : ""}</p>

                <p className={heading_style}>email
                    <span className='font-light text-red ml-1'>{error?.email ? error.email : ""}</span>
                </p>
                <input type="text" placeholder="email" className="txtbox mx-auto mb-2 w-9/12" 
                    onChange={(txt: React.ChangeEvent<HTMLInputElement>) => {setEmail(txt.target.value)}}/>

                <p className={heading_style}>password
                    <span className='font-light text-red ml-1'>{error?.password ? error.password : ""}</span>
                </p>
                <input type="password" placeholder="password" className="txtbox mx-auto mb-4 w-9/12" 
                    onChange={(txt: React.ChangeEvent<HTMLInputElement>) => {setPassword(txt.target.value)}}/>

                <button
                    type="button"
                    className="block w-9/12 mx-auto -mt-2 mb-3 text-right text-xs font-semibold color-txt-sub hover:color-txt-accent transition-colors"
                    onClick={() => navigate(`/forgot-password${location.search}`)}
                >
                    Forgot password?
                </button>

                <p className="blue-btn mx-auto my-2 w-9/12 text-center"
                     onClick={() => {signInWithEmail(email ?? '', password ?? '')}}>Login</p>

                <div
                    role="button"
                    tabIndex={0}
                    aria-label="Sign in with Apple"
                    onClick={() => { loginWithApple() }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loginWithApple(); } }}
                    className="red-btn mx-auto my-2 w-9/12 text-center bg-black text-white flex justify-center items-center cursor-pointer select-none"
                >
                    <FaApple className='mr-2 text-white' size={19}/>
                    <p>Sign in with Apple</p>
                </div>

                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { loginWithGoogle() }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loginWithGoogle(); } }}
                    className="red-btn mx-auto my-2 w-9/12 text-center bg-[#4C8BF5] flex justify-center items-center cursor-pointer select-none"
                >
                    <FaGoogle className='mr-2 text-white' size={17}/>
                    <p>Login With Google</p>
                </div>

                <p className='txt-sub text-center mt-auto hover:color-txt-accent duration-250 transition-all' onClick={() => {
                    navigate(`/${location.search}`, { state: location.state })
                }}>Don't have an account? <span className="underline">Sign up here.</span></p>
            </div>
        </div>
    )
}
