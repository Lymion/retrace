import { useState } from "react";
import { api } from "../api";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event, mode) {
    event.preventDefault();
    setError("");
    try {
      if (mode === "signup") await api.signup(email, password);
      const { token } = await api.login(email, password);
      onLogin(token);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={(e) => submit(e, "login")}>
      <h1>Todos</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit">Log in</button>
      <button type="button" onClick={(e) => submit(e, "signup")}>
        Sign up
      </button>
    </form>
  );
}
