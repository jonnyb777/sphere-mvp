import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./pages/Login";
import Home from "./pages/Home";

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  if (!user) return <Login />;

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <button onClick={() => signOut(auth)} style={{ float: "right" }}>
        Log Out
      </button>
      <Home user={user} />
    </div>
  );
}
