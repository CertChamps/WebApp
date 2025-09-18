import { useContext, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext"
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { setDoc, doc, getDoc, getDocs, collection } from "firebase/firestore";
import { db }from '../../firebase'
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase";

type authprops = {
    prevRoute?: string
}

export default function useAuthentication (props?: authprops) {

    // =============================== CONTEXT AND STATE ==================================== // 
    const { setUser } = useContext(UserContext)
    const [error, setError] = useState<any>({}) // object that holds all errors 

    useEffect(() => {console.log(error)}, [error])

    // Initialise storage & router
    const storage = getStorage()
    const navigate = useNavigate()

    // =============================== CREATING A USER ==================================== // 
    const createUser = async (uid: string, username: string, email: string) => {

        // Fetch default image from firebase
        const imageUrl = await getDownloadURL( ref(storage, 'crown.png') )


        // Initialise the User Context 
        setUser({
            uid: uid, username: username, email: email, picture: imageUrl,
            friends: [], pendingFriends: [],
            notifications: [],
            rank: 0, xp: 0,
            questionStreak: 0,
            savedQuestions: [], decks: [], 
        })

        // Add initial user data to the database
        await setDoc(doc(db, 'user-data', uid), {
            uid: uid, username: username, email: email, picture: 'crown.png',
            friends: [], pendingFriends: [],
            notifications: [],
            rank: 0, xp: 0,
            questionStreak: 0,
            savedQuestions: [],
        })

        // Go to the dashboard or previous route if it exists
            props?.prevRoute ? navigate(`${props.prevRoute}`) : navigate('/practice')
    }
    // =======================================================================================//

    // =============================== SETTING A USER UP ==================================== // 
    const userSetup  = async (uid: string, username: string, email: string) => {
        try { 
            // Grab user info from the database 
            const user = await getDoc(doc(db, 'user-data', uid))

            // Load User Decks and store in an array 
            const decksRef = collection(db, "user-data", uid, "decks")
            const deckSnapshot = await getDocs(decksRef)
            const decks = deckSnapshot.docs.map( (doc: any) => ({
                id: doc.id,
                ...doc.data()
            }))

            if ( user.exists() ) {

                // Fetch users image from firebase
                const imageUrl = await getDownloadURL( ref(storage, user.data().picture) )

                // Set user context
                setUser({
                    uid: user.id, username: user.data().username, email: user.data().email,
                    picture: imageUrl,
                    friends: user.data().friends, pendingFriends: user.data().pendingFriends,
                    notifications: user.data().notifications,
                    rank: user.data().rank, xp: user.data().xp,
                    questionStreak: user.data().questionStreak,
                    savedQuestions: user.data().savedQuestions, decks: decks,
                })     
            }
            // Otherwise we are creating a new user
            else {
                createUser(uid, username, email)
            }
        }

        // log any errors 
        catch (err) {
            console.log(err)
        }

        // Go to the dashboard or previous route if it exists
        props?.prevRoute ? navigate(`${props.prevRoute}`) : navigate('/practice')

    }
    // =======================================================================================//


    //================================== GOOGLE SERVICES ======================================//
    const loginWithGoogle = async ( ) => {

        // Get google provider 
        const provider = new GoogleAuthProvider()

        try {

            // Prompt user to sign in and wait for a result
            const result = await signInWithPopup(auth, provider)
            const user = result.user

            if ( user && user.email ) {

                // Setup User 
                userSetup(user.uid, user.displayName ?? 'newUser', user.email) 

            }
        } 
        // Log any errors
        catch (error) {
            console.log(error)
            setError((prevError: any) => ({
                ...prevError,
                general: "Something went wrong. Please try again"
            }));
        }
    };
    // ======================================================================================= //

    // ======================================== SIGN UP ======================================= //
    const signUpWithEmail = async (username: string, email: string, password: string) => {
        // Clear previous errors
        setError({})

        // Validate username length
        if (username.length < 2) {
            setError((prevError: any) => ({
            ...prevError,
            username: "Username is too short. Min 2 char."
            }))
            return
        }
        if (username.length > 10) {
            setError((prevError: any) => ({
            ...prevError,
            username: "Username is too long. Max 10 char."
            }))
            return
        }

        try {
            // Sign up with email and password 
            const userCredential = await createUserWithEmailAndPassword(auth, email, password)
            const user = userCredential.user
            
            // Create the user on our system
            if ( user ) {
                createUser(user.uid, username, email)
            }
        }
        catch (err: any) {
            // Handle Firebase errors (e.g., weak password, invalid email)
            const errorCode = err.code;
            const errorMessage = err.message;

            // Firebase error codes
            if (errorCode === 'auth/email-already-in-use') {
                setError((prevError: any) => ({
                    ...prevError,
                    email: "This email is already in use."
                }));
            } else if (errorCode === 'auth/invalid-email') {
                setError((prevError: any) => ({
                    ...prevError,
                    email: "The email address is not valid."
                }));
            } else if (errorCode === 'auth/weak-password') {
                setError((prevError: any) => ({
                    ...prevError,
                    password: "Password too short. Min 6 chars"
                }));
            } else if (errorMessage === 'Firebase: Error (auth/missing-password).') {
                setError((prevError: any) => ({
                    ...prevError,
                    password: "Please enter a password"
                }));
            } else {
                setError((prevError: any) => ({
                    ...prevError,
                    general: "Something went wrong. Please try again"
                }));
            }
        }
    }
    // ======================================================================================= //

    // ======================================== SIGN IN ======================================= //
    const signInWithEmail = async (email: string, password: string) => {
        // Clear previous errors
        setError({})

        try {
            // Sign in with email and password 
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Setup the user on our system
            if (user) {
                userSetup(user.uid, '', email)
            }
        } catch (err: any) {
            // Handle Firebase errors (e.g., incorrect email/password)
            const errorCode = err.code;
            const errorMessage = err.message;

            // Firebase error codes
            if (errorCode === 'auth/user-not-found') {
                setError((prevError: any) => ({
                    ...prevError,
                    email: "No account found with this email address."
                }));
            } else if (errorCode === 'auth/wrong-password') {
                setError((prevError: any) => ({
                    ...prevError,
                    password: "Incorrect password. Please try again."
                }));
            } else if (errorCode === 'auth/invalid-email') {
                setError((prevError: any) => ({
                    ...prevError,
                    email: "The email address is not valid."
                }));
            } else if (errorMessage === 'Firebase: Error (auth/missing-password).') {
                setError((prevError: any) => ({
                    ...prevError,
                    password: "Please enter a password."
                }));
            } else if (errorCode === 'auth/invalid-credential') {
                setError((prevError: any) => ({
                    ...prevError,
                    email: "User not found"
                }));
            } else {
                console.log(errorCode)
                setError((prevError: any) => ({
                    ...prevError,
                    general: "Something went wrong. Please try again."
                }));
            }
        }
    }
    // ======================================================================================= //
    // ======================================================================================= //

    // ======================================== EXISTING USERS ======================================= //
    useEffect(() => {

        // Listen for changes in Authentication 
        const unsubscribe = onAuthStateChanged(auth, currentUser => {
            checkExistingUser(currentUser)
        });

        // Listener Clean Up
        return () => unsubscribe();

    }, [])

    const checkExistingUser = async (user: any) => {

        // if a user exists, currently logged in 
        if (user && user.email && user.uid ) {
            
            // Setup the user 
            await userSetup(user.uid, '', user.email)

            // Navigate to home page or previous route if it exists
            props?.prevRoute ? navigate(`${props.prevRoute}`) : navigate('/practice')
            console.log(`User Exists ✅: ${user.uid}`)
        } 

    };
    // ================================================================================================= //

  return { loginWithGoogle, signUpWithEmail, signInWithEmail, userSetup, error }

}
