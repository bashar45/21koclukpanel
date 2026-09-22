import { useState } from "react";
import { sb } from "./supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) setError(error.message === "Invalid login credentials" ? "E-posta ya da şifre hatalı." : error.message);
    setBusy(false);
  }

  return (
    <div className="center">
      <form className="login" onSubmit={submit}>
        <h1>Koçluk Paneli</h1>
        <p>Devam etmek için giriş yap.</p>

        <label htmlFor="e">E-posta</label>
        <input id="e" type="email" autoComplete="username" required value={email}
               onChange={(ev) => setEmail(ev.target.value)} />

        <label htmlFor="p">Şifre</label>
        <input id="p" type="password" autoComplete="current-password" required value={password}
               onChange={(ev) => setPassword(ev.target.value)} />

        <button className="send" disabled={busy}>{busy ? "Giriliyor…" : "Giriş yap"}</button>
        {error && <div className="err">{error}</div>}
      </form>
    </div>
  );
}
