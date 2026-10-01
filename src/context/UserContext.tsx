import React, { createContext } from "react";


// ======================== USER TYPE =========================== // 
export type UserContextType = {
    authReady: boolean,
    setAuthReady: React.Dispatch<React.SetStateAction<boolean>>,
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
    isAdmin?: boolean,
    emailVerified: boolean,
    isPro?: boolean,
    subscriptionPeriodEnd?: number,
    subscriptionPlan?: "monthly" | "annual",
    subscriptionCancelAtPeriodEnd?: boolean,
    billingSubscriptions?: Partial<Record<"stripe" | "apple", { active: boolean; plan: "monthly" | "annual" | null; periodEnd: number | null; cancelAtPeriodEnd: boolean; status: string }>>,
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
    hasCompletedOnboarding?: boolean,
    studyingSubjects?: string[],
    termsVersion?: string,
    privacyVersion?: string,
    },
    setUser: React.Dispatch<React.SetStateAction<any>>
}

// ======================== USER CONTEXT  =========================== //
export const UserContext = createContext<UserContextType>({
    authReady: false,
    setAuthReady: () => {},
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
    isAdmin: false,
    emailVerified: false,
    isPro: false,
    subscriptionPeriodEnd: undefined,
    paymentProvider: undefined,
    stripeCustomerId: undefined,
    appleOriginalTransactionId: undefined,
    releaseNotesSeenVersions: [],
    hasCompletedOnboarding: undefined,
    studyingSubjects: [],
    termsVersion: undefined,
    privacyVersion: undefined,
    },
    setUser: () => {}
})
