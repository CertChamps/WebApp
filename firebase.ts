// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBuJhHXA4rtD1w3cHXtvOPgnDhcWsRfrtU",
  authDomain: "certchamps-a7527.firebaseapp.com",
  databaseURL: "https://certchamps-a7527-default-rtdb.firebaseio.com",
  projectId: "certchamps-a7527",
  storageBucket: "certchamps-a7527.firebasestorage.app",
  messagingSenderId: "433584407503",
  appId: "1:433584407503:web:dabeb6a07906ae0d6ac8ba",
  measurementId: "G-7SKFDGYV8J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);