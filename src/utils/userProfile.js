import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

export function cleanUsername(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export async function ensureUserProfile(firebaseUser, extra = {}) {
  if (!firebaseUser?.uid) return null;

  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(ref);

  const base = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    displayName: firebaseUser.displayName || extra.displayName || "",
    photoURL: firebaseUser.photoURL || "",
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    const username = cleanUsername(extra.username || "");

if (username) {
  const usernameRef = doc(db, "usernames", username);
  const usernameSnap = await getDoc(usernameRef);

  if (usernameSnap.exists()) {
    throw new Error("USERNAME_TAKEN");
  }

  const batch = writeBatch(db);

  batch.set(ref, {
    ...base,
    username,
    createdAt: serverTimestamp()
  }, { merge: true });

  batch.set(usernameRef, {
    uid: firebaseUser.uid,
    username,
    createdAt: serverTimestamp()
  });

  await batch.commit();
} else {
  await setDoc(
    ref,
    {
      ...base,
      username: "",
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}
  } else {
    await setDoc(ref, base, { merge: true });
  }

  return ref;
}