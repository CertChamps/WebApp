import { useState, useContext, useEffect } from 'react';
import { UserContext } from '../context/UserContext';
import { updateDoc, doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db }from '../../firebase'
import correctSound from "../assets/sounds/Click-Bounce_Success.wav";
import incorrectSound from "../assets/sounds/Click-Bounce_Failure.wav";
import useMaths from './useMaths';

type rankProps = { 
    rankRef: any;
    setIsRight: any;
    setShowNoti: any;
    xpFlyers: any;
    setXpFlyers: any;
}

export default function useRank(props: rankProps) {

    const { user, setUser } = useContext(UserContext);  

    const { isCorrect } = useMaths();

    const [rank, setRank] = useState(user.rank); // the rank number 
    const [progress, setProgress] = useState(0); // progress towards next rank in % 
    const [xp, setXp] = useState(user.xp); // current xp
    const [streak, setStreak] = useState(user.streak); // current streak

    // Update state and context when user changes
    useEffect(() => {

        // update user context when any of these change
        if (user) {
            setUser({
                ...user,    
                rank,
                progress,
                xp,
                streak
            });
        }

        // update on firebase when any of these change
        if (user) {
            const userRef = doc(db, 'user-data', user.uid);
            updateDoc(userRef, {
                rank,
                progress,
                xp,
                streak
            });
        }   
    }, [rank, progress, xp, streak]);

    // Update progress when xp changes 
    useEffect(() => {
        setTimeout(() => {
            calculateProgress();
        }, 1000);
    }, [xp]);
    

    // ============================ CALCULATE RANK PROGRESS ============================ //
    const calculateProgress = () => { 
        // console.log(xp, progress, 'fffffffffffffff')
        const thresholds = [100, 300, 1000, 5000, 10000, 100000];
        let remainingXP = xp;
        let newRank = 0;

        for (let i = 0; i < thresholds.length; i++) {
            if (remainingXP < thresholds[i]) {
            const prog = (remainingXP / thresholds[i]) * 100;
            setRank(i + 1);   // 1-based
            setProgress(prog);
            return;
            }
            remainingXP -= thresholds[i];
            newRank++;
        }

        // max rank
        setRank(thresholds.length);
        setProgress(100);

    };
    // ================================================================================= //

    // ===================================== ADD XP ==================================== //
    async function syncUserData(newState: Partial<typeof user>) {
        if (!user) return;
        const userRef = doc(db, 'user-data', user.uid);
        await updateDoc(userRef, newState);
        setUser({ ...user, ...newState });
    }
    // ================================================================================= //


    
    // ============================ ADD XP ============================ //
    function awardXP(amount: number) {
        
        if (!props.rankRef.current) return;

        // Animation properties
        const parentEl = props.rankRef.current.parentElement ?? props.rankRef.current;
        const parentBox = parentEl.getBoundingClientRect();
        const parentHeight = parentBox.height; // height of parent element

        // target coordinate based on parent height/position
        const to = {
            x: 0,
            y: -parentHeight / 2 , // adjust 20 for padding
        };

        // split into 10‑XP pips + optional remainder pip
        const chunkSize = 10;
        const chunks = Math.floor(amount / chunkSize);
        const rem = amount % chunkSize;

        const baseDelay = 0.08; // seconds between pips
        const now = Date.now();
    
        // initialize new pips array
        const newPips: typeof props.xpFlyers = [];

        // Create pips 
        for (let i = 0; i < chunks; i++) {
            newPips.push({
                id: now + i,
                to,
                amount: chunkSize,
                delay: i * baseDelay,
                pitchIndex: i, // ladder up
            });
        }

        if (rem > 0) {
            newPips.push({
                id: now + chunks,
                to,
                amount: rem,
                delay: chunks * baseDelay,
                pitchIndex: chunks,
              });
        }

        props.setXpFlyers((prev:any) => [...prev, ...newPips]);
           
    }

    // ======================================================================================= //

    // ============================ TRACK COMPLETED QUESTIONS ============================ //
    async function trackCompletedQuestion(questionId: string, tags: string[]) {
        if (!user?.uid || !questionId || !tags?.length) return;

        // Only track these main topics
        const validTopics = [
            "Algebra",
            "Area & Volume",
            "Calculus",
            "Complex Numbers",
            "Financial Maths",
            "Coordinate Geometry",
            "Probability",
            "Sequences & Series",
            "Statistics",
            "Trigonometry",
            "Geometry",
            "First Year Algebra"
        ];

        // Filter tags to only include valid main topics
        const mainTopics = tags.filter(tag => validTopics.includes(tag));
        
        if (mainTopics.length === 0) return;

        try {
            // For each main topic, check if question is already completed
            for (const topic of mainTopics) {
                const topicRef = doc(db, 'user-data', user.uid, 'completed-questions', topic);
                const topicSnap = await getDoc(topicRef);

                if (topicSnap.exists()) {
                    const data = topicSnap.data();
                    const completedIds = data?.questionIds || [];
                    
                    // Only add if not already completed
                    if (!completedIds.includes(questionId)) {
                        await updateDoc(topicRef, {
                            questionIds: arrayUnion(questionId)
                        });
                    }
                } else {
                    // Create new topic doc with this question
                    await setDoc(topicRef, {
                        questionIds: [questionId],
                        topic: topic
                    });
                }
            }
        } catch (error) {
            console.error("Failed to track completed question", error);
        }
    }
    // ================================================================================= //

    
    //===================================== Answer checking ===================================//
    async function onCheck(inputs: any, answers: any, questionId?: string, tags?: string[]) {
          
        const ok = isCorrect(inputs, answers);
        
        // inside onCheck()
        if (ok) {
            playCorrectSound();

            // Track completed question
            if (questionId && tags) {
                await trackCompletedQuestion(questionId, tags);
            }
          
            setStreak((prevStreak: number) => {
              const newStreak = prevStreak + 1;
              const reward = newStreak * 10;
          
              // Update XP right here — using function form ensures both are in sync
              setXp((prevXp) => {
                const updatedXp = prevXp + reward;
                syncUserData({ xp: updatedXp, streak: newStreak });
                awardXP(reward);
                return updatedXp;
              });
          
              return newStreak;
            });
          } else {

            playIncorrectSound();
            setStreak(0);
    
        }
          
        props.setIsRight(ok);
        props.setShowNoti(true);

    }
    // ================================================================================= //

    // =========================================== SOUNDS =========================================== //
    function playCorrectSound() {
        try {
          const audio = new Audio(correctSound);
          audio.volume = 0.6; // tweak volume as you like
          audio.play().catch(() => {});
        } catch (err) {
          console.error("Could not play sound", err);
        }
    }

    function playIncorrectSound() {
        try {
          const audio = new Audio(incorrectSound);
          audio.volume = 0.6; // tweak volume as you like
          audio.play().catch(() => {});
        } catch (err) {
          console.error("Could not play sound", err);
        }
    }
    // ============================================================================================= //

    return { rank, progress, setProgress, xp, streak, onCheck }
}