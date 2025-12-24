import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDUynpTPGatQju1c0UUqJGXU90RStpvRz0",
  authDomain: "sphere-mvp-b63da.firebaseapp.com",
  projectId: "sphere-mvp-b63da",
  storageBucket: "sphere-mvp-b63da.firebasestorage.app",
  messagingSenderId: "115789780500",
  appId: "1:115789780500:web:9364aaddc6ee060d69f901"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
