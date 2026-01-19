import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Ensures a Firestore user document exists.
 * - First login: creates users/{uid}
 * - Every login: updates lastLoginAt + email
 *
 * Server-backed source of truth fields:
 * - role (e.g. "admin")
 * - flowAccess (boolean)
 * - canPost (boolean)
 * - onboardingComplete (boolean)
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
    // ✅ First login: create defaults
    const first = {
      ...base,
      createdAt: serverTimestamp(),

      // ---- Server-backed flags ----
      role: "user",        // you can manually set yourself to "admin"
      flowAccess: false,  // paid access flag
      canPost: true,      // can submit to Spherical
      onboardingComplete: false
    };

    await setDoc(ref, first);
    return first;
  }

  // ✅ Returning user: update login info only
  await setDoc(ref, base, { merge: true });
  return snap.data();
}

/**
 * Optional helper if you ever want to fetch manually
 */
export async function readUserDoc(uid) {
  if (!uid) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
