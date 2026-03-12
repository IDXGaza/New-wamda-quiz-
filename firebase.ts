
import { initializeApp } from 'firebase/app';
import { getAuth, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use default database
export const db = getFirestore(app);

export const registerWithEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);
export const loginWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const logout = () => signOut(auth);
