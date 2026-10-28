import { useState } from "react";
import Login from "./pages/Login";
import Todos from "./pages/Todos";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));

  function handleLogin(newToken) {
    localStorage.setItem("token", newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setToken(null);
  }

  return token ? <Todos onLogout={handleLogout} /> : <Login onLogin={handleLogin} />;
}
