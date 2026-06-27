import { useEffect, useState } from "react";
import { Login } from "./components/Login";
import { VaultInfo } from "./components/VaultInfo";
import { VaultManager } from "./components/VaultManager";
import { MergeTool } from "./components/MergeTool";
import { clearToken, isLoggedIn } from "./auth";
import { UNAUTHORIZED_EVENT } from "./api";

type Tab = "vault" | "merge";

export function App() {
    const [loggedIn, setLoggedIn] = useState(isLoggedIn());
    const [tab, setTab] = useState<Tab>("vault");
    const [vaultId, setVaultId] = useState("default");

    // Quando a API sinaliza 401 (token expirado), volta à tela de login.
    useEffect(() => {
        const onUnauthorized = () => setLoggedIn(false);
        window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    }, []);

    if (!loggedIn) {
        return <Login onLoggedIn={() => setLoggedIn(true)} />;
    }

    return (
        <>
            <header className="app-header">
                <h1>Obsidian PHP Sync — Dashboard</h1>
                <VaultManager vaultId={vaultId} onChange={setVaultId} />
                <div className="tabs">
                    <button
                        className={tab === "vault" ? "active" : ""}
                        onClick={() => setTab("vault")}
                    >
                        Vault
                    </button>
                    <button
                        className={tab === "merge" ? "active" : ""}
                        onClick={() => setTab("merge")}
                    >
                        Merge
                    </button>
                </div>
                <button
                    className="secondary"
                    onClick={() => {
                        clearToken();
                        setLoggedIn(false);
                    }}
                >
                    Sair
                </button>
            </header>

            <main className="content">
                {tab === "vault" ? (
                    <VaultInfo vaultId={vaultId || "default"} />
                ) : (
                    <MergeTool currentVaultId={vaultId || "default"} />
                )}
            </main>
        </>
    );
}
