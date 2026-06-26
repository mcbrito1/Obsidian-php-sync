import { useRef, useState } from "react";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import {
    ApiError,
    downloadText,
    fetchVersionText,
    fetchVersions,
    uploadText,
} from "../api";
import { MergeSide, VersionEntry } from "../types";

interface Props {
    currentVaultId: string;
}

const baseExtensions = [lineNumbers(), markdown(), EditorView.lineWrapping];

export function MergeTool({ currentVaultId }: Props) {
    const [path, setPath] = useState("");
    const [sideA, setSideA] = useState<MergeSide>({
        type: "vault",
        vaultId: currentVaultId,
        versionId: "",
    });
    const [sideB, setSideB] = useState<MergeSide>({
        type: "vault",
        vaultId: currentVaultId,
        versionId: "",
    });
    const [versionsA, setVersionsA] = useState<VersionEntry[]>([]);
    const [versionsB, setVersionsB] = useState<VersionEntry[]>([]);
    const [targetVault, setTargetVault] = useState(currentVaultId);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [loaded, setLoaded] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const mergeRef = useRef<MergeView | null>(null);

    async function loadSideContent(side: MergeSide): Promise<string> {
        if (side.type === "version") {
            if (!side.versionId) throw new ApiError("Selecione uma versão.", 0);
            return fetchVersionText(path, side.versionId, side.vaultId);
        }
        return downloadText(path, side.vaultId);
    }

    async function handleLoad() {
        setError("");
        setStatus("");
        if (!path) {
            setError("Informe o caminho do arquivo.");
            return;
        }
        try {
            const [docA, docB] = await Promise.all([
                loadSideContent(sideA),
                loadSideContent(sideB),
            ]);

            mergeRef.current?.destroy();
            mergeRef.current = new MergeView({
                a: {
                    doc: docA,
                    extensions: [...baseExtensions, EditorState.readOnly.of(true)],
                },
                b: {
                    doc: docB,
                    extensions: baseExtensions,
                },
                parent: containerRef.current!,
                collapseUnchanged: { margin: 3, minSize: 4 },
            });
            setLoaded(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao carregar os lados.");
        }
    }

    async function handleSave() {
        if (!mergeRef.current) return;
        setError("");
        setStatus("");
        const merged = mergeRef.current.b.state.doc.toString();
        try {
            await uploadText(path, merged, targetVault || "default");
            setStatus(`Salvo em "${targetVault || "default"}" / ${path}.`);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao salvar.");
        }
    }

    async function loadVersions(side: "A" | "B") {
        if (!path) {
            setError("Informe o caminho antes de listar versões.");
            return;
        }
        const target = side === "A" ? sideA : sideB;
        try {
            const list = await fetchVersions(path, target.vaultId);
            (side === "A" ? setVersionsA : setVersionsB)(list);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Falha ao listar versões.");
        }
    }

    function renderSide(
        label: string,
        side: MergeSide,
        setSide: (s: MergeSide) => void,
        versions: VersionEntry[],
        which: "A" | "B",
    ) {
        return (
            <div className="card" style={{ flex: 1 }}>
                <strong>{label}</strong>
                <div className="row" style={{ marginTop: 12 }}>
                    <select
                        aria-label={`Tipo ${label}`}
                        value={side.type}
                        onChange={(e) =>
                            setSide({ ...side, type: e.target.value as MergeSide["type"] })
                        }
                    >
                        <option value="vault">Cofre</option>
                        <option value="version">Versão</option>
                    </select>
                    <input
                        aria-label={`Cofre ${label}`}
                        value={side.vaultId}
                        onChange={(e) => setSide({ ...side, vaultId: e.target.value.trim() })}
                        placeholder="cofre"
                        style={{ width: 110 }}
                    />
                </div>
                {side.type === "version" && (
                    <div className="row">
                        <button className="secondary" onClick={() => void loadVersions(which)}>
                            Listar versões
                        </button>
                        <select
                            aria-label={`Versão ${label}`}
                            value={side.versionId}
                            onChange={(e) => setSide({ ...side, versionId: e.target.value })}
                        >
                            <option value="">selecione…</option>
                            {versions.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {new Date(v.mtime * 1000).toLocaleString()} ({v.size} B)
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="row">
                <input
                    aria-label="Caminho"
                    value={path}
                    onChange={(e) => setPath(e.target.value.trim())}
                    placeholder="Notas/exemplo.md"
                    style={{ width: 320 }}
                />
                <button onClick={() => void handleLoad()}>Carregar</button>
            </div>

            <div className="row" style={{ alignItems: "stretch" }}>
                {renderSide("Lado A (referência)", sideA, setSideA, versionsA, "A")}
                {renderSide("Lado B (editável)", sideB, setSideB, versionsB, "B")}
            </div>

            {error && <div className="error">{error}</div>}
            {status && <div className="mono">{status}</div>}

            <div className="merge-view" ref={containerRef} />

            {loaded && (
                <div className="row" style={{ marginTop: 12 }}>
                    <span className="mono">Salvar resultado (lado B) em:</span>
                    <input
                        aria-label="Cofre destino"
                        value={targetVault}
                        onChange={(e) => setTargetVault(e.target.value.trim())}
                        placeholder="cofre destino"
                        style={{ width: 110 }}
                    />
                    <span className="mono">/ {path}</span>
                    <button onClick={() => void handleSave()}>Salvar</button>
                </div>
            )}
        </>
    );
}
