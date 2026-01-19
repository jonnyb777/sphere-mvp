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
        setUserDoc(null); // don't block app
      } finally {
        setBooting(false);
      }
    });

    return () => unsub();
  }, []);

  if (booting) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>Loading Sphere…</div>
      </div>
    );
  }

  if (!firebaseUser) return <Login />;

  // ✅ pass “server-backed user context”
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

      <Home user={userCtx} />
    </div>
  );
}
