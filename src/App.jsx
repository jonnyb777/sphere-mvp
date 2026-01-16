// FILE: src/App.jsx
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./pages/Login";
import Home from "./pages/Home";
import { ensureUserDoc, readUserDoc } from "./lib/ensureUserDoc";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);

      if (!u) {
        setUserDoc(null);
        setBooting(false);
        return;
      }

      try {
        // ✅ Create/update users/{uid}
        await ensureUserDoc(u);

        // ✅ Read server-backed truth (flowAccess/role/etc)
        const docData = await readUserDoc(u.uid);
        setUserDoc(docData || null);
      } catch (e) {
        console.error("Auth -> Firestore user bootstrap error:", e);
        // Don’t block app if Firestore fails; still allow basic usage
        setUserDoc(null);
      } finally {
        setBooting(false);
      }
    });

    return () => unsub();
  }, []);

  if (booting) return null;
  if (!firebaseUser) return <Login />;

  // ✅ Use a plain “user context” object for your UI components
  const userCtx = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    role: userDoc?.role || "user",
    flowAccess: !!userDoc?.flowAccess,
    canPost: userDoc?.canPost !== false
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--s-white, #fff)" }}>
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => signOut(auth)}>Log Out</button>
      </div>

      {/* IMPORTANT: pass userCtx, not raw firebaseUser */}
      <Home user={userCtx} />
    </div>
  );
}
