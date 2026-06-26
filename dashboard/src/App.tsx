import { useState } from "react";
import { Login } from "./components/Login";
import { VaultInfo } from "./components/VaultInfo";
import { MergeTool } from "./components/MergeTool";
import { clearToken, isLoggedIn } from "./auth";

type Tab = "vault" | "merge";

export function App() {
    const [loggedIn, setLoggedIn] = useState(isLoggedIn());
    const [tab, setTab] = useState<Tab>("vault");
    const [vaultId, setVaultId] = useState("default");

    if (!loggedIn) {
        return <Login onLoggedIn={() => setLoggedIn(true)} />;
    }

    return (
        <>
            <header className="app-header">
                <h1>Obsidian PHP Sync — Dashboard</h1>
                <label className="mono">
                    Cofre:&nbsp;
                    <input
                        aria-label="Cofre"
                        value={vaultId}
                        onChange={(e) => setVaultId(e.target.value.trim())}
                        placeholder="default"
                        style={{ width: 120 }}
                    />
                </label>
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
