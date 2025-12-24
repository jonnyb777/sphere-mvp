import { useState } from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signIn = async () => {
    alert("Sign In button clicked");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Signed in successfully");
    } catch (err) {
      console.error("SIGN IN ERROR:", err);
      alert(err.message);
    }
  };

  const signUp = async () => {
    alert("Sign Up button clicked");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("Signed up successfully");
    } catch (err) {
      console.error("SIGN UP ERROR:", err);
      alert(err.message);
    }
  };

  const signInWithGoogle = async () => {
    alert("Google Sign-In clicked");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      alert("Signed in with Google");
    } catch (err) {
      console.error("GOOGLE SIGN IN ERROR:", err);
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h2>Login to Sphere (Debug Mode)</h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br /><br />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <br /><br />

      <button onClick={signIn}>Sign In</button>

      <button onClick={signUp} style={{ marginLeft: "1rem" }}>
        Sign Up
      </button>

      <hr />

      <button onClick={signInWithGoogle}>
        Sign in with Google
      </button>
    </div>
  );
}

export default Login;
