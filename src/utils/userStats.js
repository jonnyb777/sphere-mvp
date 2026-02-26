// FILE: src/utils/userStats.js
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "../firebase";

export async function ensureUserStats(uid) {
  if (!uid) return;
  const ref = doc(db, "userStats", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(
    ref,
    {
      uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      uploads: 0,
      sessions: 0,
      streak: 0,
      milestones: {
        firstUpload: false,
        firstFlowView: false,
        firstPost: false
      }
    },
    { merge: true }
  );
}

export async function bumpSession(uid) {
  if (!uid) return;
  const ref = doc(db, "userStats", uid);
  await updateDoc(ref, {
    sessions: increment(1),
    updatedAt: serverTimestamp()
  });
}
export async function markFirstPost(uid) {
  if (!uid) return;
  const ref = doc(db, "userStats", uid);
  await updateDoc(ref, {
    "milestones.firstPost": true,
    updatedAt: serverTimestamp()
  });
}
export async function markFirstUpload(uid) {
  if (!uid) return;
  const ref = doc(db, "userStats", uid);
  await updateDoc(ref, {
    uploads: increment(1),
    "milestones.firstUpload": true,
    updatedAt: serverTimestamp()
  });
}

export async function markFirstFlowView(uid) {
  if (!uid) return;
  const ref = doc(db, "userStats", uid);
  await updateDoc(ref, {
    "milestones.firstFlowView": true,
    updatedAt: serverTimestamp()
  });
}
