import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export function useUserDoc(uid) {
  const [userDoc, setUserDoc] = useState(null);
  const [loadingUserDoc, setLoadingUserDoc] = useState(true);

  useEffect(() => {
    if (!uid) {
      setUserDoc(null);
      setLoadingUserDoc(false);
      return;
    }

    setLoadingUserDoc(true);
    const ref = doc(db, "users", uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setUserDoc(snap.exists() ? snap.data() : null);
        setLoadingUserDoc(false);
      },
      (err) => {
        console.error("useUserDoc snapshot error:", err);
        setUserDoc(null);
        setLoadingUserDoc(false);
      }
    );

    return () => unsub();
  }, [uid]);

  return { userDoc, loadingUserDoc };
}
