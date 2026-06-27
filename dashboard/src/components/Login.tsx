import { FormEvent, useState } from "react";
import { ApiError, login } from "../api";

interface Props {
    onLoggedIn: () => void;
}

export function Login({ onLoggedIn }: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await login(username, password);
            onLoggedIn();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao autenticar.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="login">
            <h1>Obsidian PHP Sync</h1>
            <form className="card" onSubmit={handleSubmit}>
                <label>
                    Usuário
                    <input
                        aria-label="Usuário"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoFocus
                    />
                </label>
                <label>
                    Senha
                    <input
                        aria-label="Senha"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>
                {error && <div className="error">{error}</div>}
                <button type="submit" disabled={busy}>
                    {busy ? "Entrando…" : "Entrar"}
                </button>
            </form>
        </div>
    );
}
