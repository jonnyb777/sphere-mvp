// FILE: src/lib/writeWaitlist.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Writes a waitlist record to Firestore.
 * Collection: waitlist
 * Document fields are all simple strings/values for easy viewing in console.
 */
export async function writeWaitlist({ uid, email, reason }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanReason = String(reason || "unknown").trim();

  if (!cleanEmail) throw new Error("Missing email for waitlist.");

  return await addDoc(collection(db, "waitlist"), {
    uid: uid || null,
    email: cleanEmail,
    reason: cleanReason,
    createdAt: serverTimestamp(),
    status: "new"
  });
}
