// FILE: src/App.jsx
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

import "./App.css";

import { auth, db } from "./firebase";
import Login from "./pages/Login";
import Home from "./pages/Home";
import { ensureUserDoc } from "./utils/userDoc";
import { ensureUserStats, bumpSession } from "./utils/userStats";

export default function App() {
  // authReady prevents "Login flash" while Firebase restores session
  const [authReady, setAuthReady] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);

  // bootingUserDoc covers the Firestore user doc subscription
  const [bootingUserDoc, setBootingUserDoc] = useState(false);

  useEffect(() => {
    let unsubUserDoc = null;

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      // ✅ auth is now decided (even if null)
      setAuthReady(true);

      setFirebaseUser(currentUser || null);
      setUserDoc(null);

      // clean up prior user doc subscription
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      // logged out
      if (!currentUser) {
        setBootingUserDoc(false);
        return;
      }

      // logged in → boot user doc
      setBootingUserDoc(true);

      try {
        // Ensure Firestore user document exists (first login defaults)
        await ensureUserDoc(currentUser);
        
        // NEW: ensure userStats exists + count a session
        await ensureUserStats(currentUser.uid);
        await bumpSession(currentUser.uid);

        // Live subscribe so flowAccess / flowConsent updates reflect immediately
        const ref = doc(db, "users", currentUser.uid);
        unsubUserDoc = onSnapshot(
          ref,
          (snap) => {
            setUserDoc(snap.exists() ? snap.data() : null);
            setBootingUserDoc(false);
          },
          (err) => {
            console.error("users/{uid} onSnapshot error:", err);
            setUserDoc(null);
            setBootingUserDoc(false);
          }
        );
      } catch (e) {
        console.error("ensureUserDoc error:", e);
        setBootingUserDoc(false);
      }
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubAuth();
    };
  }, []);

  // ✅ Prevent the login page from flashing while auth is still restoring
  if (!authReady) {
    return (
      <div style={{ padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
        Loading Sphere…
      </div>
    );
  }

  // Not logged in
  if (!firebaseUser) return <Login />;

  // Logged in but still booting userDoc
  if (bootingUserDoc) {
    return (
      <div style={{ padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
        Loading your Sphere profile…
      </div>
    );
  }

  // If doc failed to load, still render Home with minimal safe user shape
  const safeUser = {
    ...(userDoc || {}),
    uid: (userDoc && userDoc.uid) || firebaseUser.uid,
    email: (userDoc && userDoc.email) || firebaseUser.email,

    // ✅ force booleans so UI can rely on them
    flowAccess: !!(userDoc && userDoc.flowAccess),
    flowConsent: !!(userDoc && userDoc.flowConsent)
  };

  return <Home user={safeUser} firebaseUser={firebaseUser} />;
}
