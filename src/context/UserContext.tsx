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
    /** Where the user actually pays today. Drives the "Manage
     *  subscription" routing on the account page so that a user who
     *  signed up via Stripe on web can still cancel from inside the
     *  iPad app (and vice versa). */
    paymentProvider?: "stripe" | "apple",
    /** Set once a Stripe checkout completes. Required to open the
     *  Stripe Billing Portal. */
    stripeCustomerId?: string,
    /** Set once an Apple IAP completes. Permanent identifier for the
     *  Apple subscription across renewals. */
    appleOriginalTransactionId?: string,
    releaseNotesSeenVersions?: string[],
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
    paymentProvider: undefined,
    stripeCustomerId: undefined,
    appleOriginalTransactionId: undefined,
    releaseNotesSeenVersions: [],
    },
    setUser: () => {}
})