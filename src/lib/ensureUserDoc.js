// FILE: src/lib/ensureUserDoc.js
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Ensures a Firestore user document exists.
 * - First login: creates users/{uid}
 * - Every login: updates lastLoginAt + email
 *
 * Server-backed source of truth fields live here:
 * - role (e.g. "admin")
 * - flowAccess (boolean)
 * - canPost (boolean)
 */
export async function ensureUserDoc(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(ref);

  const base = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || null,
    lastLoginAt: serverTimestamp()
  };

  if (!snap.exists()) {
    // ✅ First login: create defaults once
    const first = {
      ...base,
      createdAt: serverTimestamp(),

      // ---- Server-backed flags (defaults) ----
      role: "user",          // "admin" for you later
      flowAccess: false,     // server truth for paid access
      canPost: true,         // allow posting (you can change later)

      // Optional: keep track of onboarding
      onboardingComplete: false
    };

    await setDoc(ref, first, { merge: true });
    return first;
  }

  // ✅ Returning login: update a couple fields
  await setDoc(ref, base, { merge: true });
  return snap.data();
}

/**
 * Helper: load the user doc (the server truth).
 */
export async function readUserDoc(uid) {
  if (!uid) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
