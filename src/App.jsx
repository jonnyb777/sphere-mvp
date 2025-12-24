import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import Login from "./pages/Login";
import TransactionUploader from "./components/TransactionUploader";
import MonthlyDrip from "./components/MonthlyDrip";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

function App() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Load saved transactions for this user
  const loadSavedTransactions = async (uid) => {
    setLoadingSaved(true);
    try {
      const ref = doc(db, "users", uid, "mvp", "transactions");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setTransactions(Array.isArray(data.items) ? data.items : []);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error("LOAD SAVED TX ERROR:", err);
      alert("Could not load saved transactions. Check console for details.");
    } finally {
      setLoadingSaved(false);
    }
  };

  // Save transactions for this user
  const saveTransactions = async (uid, items) => {
    try {
      const ref = doc(db, "users", uid, "mvp", "transactions");
      await setDoc(
        ref,
        { items, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error("SAVE TX ERROR:", err);
      alert("Could not save transactions. Check console for details.");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser?.uid) {
        await loadSavedTransactions(currentUser.uid);
      } else {
        setTransactions([]);
      }
    });

    return unsubscribe;
  }, []);

  // When uploader gives us new transactions, update UI + save to Firestore
  const handleUpload = async (items) => {
    setTransactions(items);
    if (user?.uid) {
      await saveTransactions(user.uid, items);
    }
  };

  if (!user) return <Login />;

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Sphere MVP</h1>
      <p>Logged in as: {user.email}</p>

      <button onClick={() => signOut(auth)}>Log Out</button>

      <hr />

      {loadingSaved ? (
        <p>Loading your saved transactions…</p>
      ) : (
        <p style={{ fontSize: "0.9rem" }}>
          Saved transactions loaded: <b>{transactions.length}</b>
        </p>
      )}

      <TransactionUploader onUpload={handleUpload} />
      <MonthlyDrip transactions={transactions} />
    </div>
  );
}

export default App;
