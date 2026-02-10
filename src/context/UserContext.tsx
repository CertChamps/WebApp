import React, { createContext } from "react";


// ======================== USER TYPE =========================== // 
export type UserContextType = {
    user: {
    uid: string,   
    username: string,
    email: string, 
    picture: string,
    friends: any[],
    pendingFriends: any[],
    notifications: any[],
    rank: number,
    xp: number,
    questionStreak: number, 
    savedQuestions: any[],
    decks: any[],
    streak: number,
    highestStreak: number,
    hasCompletedTutorial: boolean,
    isAdmin?: boolean,
    emailVerified: boolean,
    isPro?: boolean,
    subscriptionPeriodEnd?: number,
    },
    setUser: React.Dispatch<React.SetStateAction<any>>
}

// ======================== USER CONTEXT  =========================== //
export const UserContext = createContext<UserContextType>({
    user: {
    uid: '', 
    username: '', 
    email: '',
    picture: '',
    friends: [],
    pendingFriends: [], 
    notifications: [],
    rank: 0,
    xp: 0,
    questionStreak: 0,
    savedQuestions: [],
    decks: [],
    streak: 0,
    highestStreak: 0,
    hasCompletedTutorial: false,
    isAdmin: false,
    emailVerified: false,
    isPro: false,
    subscriptionPeriodEnd: undefined,
    },
    setUser: () => {}
})