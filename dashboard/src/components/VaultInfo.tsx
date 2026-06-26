import { useCallback, useEffect, useState } from "react";
import { ApiError, downloadRaw, fetchManifest } from "../api";
import { RemoteFile } from "../types";

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(epochSeconds: number): string {
    return new Date(epochSeconds * 1000).toLocaleString();
}

interface Props {
    vaultId: string;
}

export function VaultInfo({ vaultId }: Props) {
    const [files, setFiles] = useState<RemoteFile[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [preview, setPreview] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setFiles(await fetchManifest(vaultId));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao carregar o cofre.");
        } finally {
            setLoading(false);
        }
    }, [vaultId]);

    useEffect(() => {
        void load();
        setSelected(null);
        setPreview("");
    }, [load]);

    async function openPreview(path: string) {
        setSelected(path);
        setPreview("Carregando…");
        try {
            const { text, isBinary } = await downloadRaw(path, vaultId);
            setPreview(isBinary ? "(arquivo binário — preview indisponível)" : text);
        } catch (err) {
            setPreview(err instanceof ApiError ? err.message : "Falha ao baixar o arquivo.");
        }
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const lastMtime = files.reduce((max, f) => Math.max(max, f.mtime), 0);

    return (
        <>
            <div className="row">
                <button className="secondary" onClick={() => void load()} disabled={loading}>
                    {loading ? "Atualizando…" : "Atualizar"}
                </button>
                <span className="mono">cofre: {vaultId}</span>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="card stats">
                <div className="stat">
                    <div className="value">{files.length}</div>
                    <div className="label">arquivos</div>
                </div>
                <div className="stat">
                    <div className="value">{formatBytes(totalSize)}</div>
                    <div className="label">tamanho total</div>
                </div>
                <div className="stat">
                    <div className="value">{lastMtime ? formatDate(lastMtime) : "—"}</div>
                    <div className="label">última modificação</div>
                </div>
            </div>

            <div className="card">
                <table>
                    <thead>
                        <tr>
                            <th>Arquivo</th>
                            <th>Tamanho</th>
                            <th>Modificado</th>
                            <th>Hash</th>
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((file) => (
                            <tr
                                key={file.path}
                                className="clickable"
                                onClick={() => void openPreview(file.path)}
                            >
                                <td>{file.path}</td>
                                <td>{formatBytes(file.size)}</td>
                                <td>{formatDate(file.mtime)}</td>
                                <td className="mono">{file.hash.slice(0, 12)}…</td>
                            </tr>
                        ))}
                        {files.length === 0 && !loading && (
                            <tr>
                                <td colSpan={4} className="mono">
                                    (cofre vazio)
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {selected && (
                <div className="card">
                    <div className="row">
                        <strong>{selected}</strong>
                    </div>
                    <div className="preview">{preview}</div>
                </div>
            )}
        </>
    );
}
