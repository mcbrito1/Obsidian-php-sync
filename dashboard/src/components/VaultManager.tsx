import { useEffect, useState } from "react";
import {
    ApiError,
    createVault,
    deleteVault,
    fetchVaults,
    renameVault,
} from "../api";
import { isAdminUser } from "../auth";

interface Props {
    vaultId: string;
    onChange: (id: string) => void;
}

export function VaultManager({ vaultId, onChange }: Props) {
    const [vaults, setVaults] = useState<string[]>([]);
    const [newId, setNewId] = useState("");
    const [error, setError] = useState("");
    const admin = isAdminUser();

    async function reload(selectFirst = false): Promise<void> {
        setError("");
        try {
            const list = await fetchVaults();
            setVaults(list);
            if (selectFirst && list.length > 0 && !list.includes(vaultId)) {
                onChange(list[0]);
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao listar cofres.");
        }
    }

    // Carrega a lista de cofres ao montar.
    useEffect(() => {
        void reload(true);
    }, []);

    async function handleCreate(): Promise<void> {
        const id = newId.trim();
        if (!id) return;
        setError("");
        try {
            await createVault(id);
            setNewId("");
            await reload();
            onChange(id);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao criar o cofre.");
        }
    }

    async function handleRename(): Promise<void> {
        const next = window.prompt(`Novo nome para o cofre "${vaultId}":`, vaultId);
        if (!next || next.trim() === "" || next === vaultId) return;
        setError("");
        try {
            await renameVault(vaultId, next.trim());
            await reload();
            onChange(next.trim());
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao renomear.");
        }
    }

    async function handleDelete(): Promise<void> {
        if (!window.confirm(`Excluir o cofre "${vaultId}" e TODO o seu conteúdo?`)) return;
        setError("");
        try {
            await deleteVault(vaultId);
            await reload(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao excluir.");
        }
    }

    return (
        <div className="vault-manager">
            <label className="mono">
                Cofre:&nbsp;
                <select
                    aria-label="Cofre"
                    value={vaultId}
                    onChange={(e) => onChange(e.target.value)}
                >
                    {!vaults.includes(vaultId) && <option value={vaultId}>{vaultId}</option>}
                    {vaults.map((v) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            </label>

            {admin && (
                <>
                    <input
                        aria-label="Novo cofre"
                        value={newId}
                        placeholder="novo cofre"
                        onChange={(e) => setNewId(e.target.value)}
                        style={{ width: 110 }}
                    />
                    <button className="secondary" onClick={() => void handleCreate()}>
                        Criar
                    </button>
                    <button className="secondary" onClick={() => void handleRename()}>
                        Renomear
                    </button>
                    <button className="secondary" onClick={() => void handleDelete()}>
                        Excluir
                    </button>
                </>
            )}
            {error && <span className="error">{error}</span>}
        </div>
    );
}
