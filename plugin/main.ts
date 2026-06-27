import {
    App,
    debounce,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    requestUrl,
    normalizePath,
} from "obsidian";

import { SyncClient, SyncError } from "./src/SyncClient";
import { buildLastSync, FileMeta, planSync } from "./src/syncPlan";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./src/base64";
import { sha256 } from "./src/hash";
import { parsePatterns, shouldSync } from "./src/filter";
import {
    DEFAULT_SETTINGS,
    HashCacheEntry,
    HttpRequestFn,
    PluginSettings,
} from "./src/types";

/** Adapta o `requestUrl` do Obsidian para a interface usada pelo SyncClient. */
const obsidianHttp: HttpRequestFn = async (options) => {
    const response = await requestUrl({
        url: options.url,
        method: options.method,
        headers: options.headers,
        body: options.body,
        throw: false,
    });

    // `requestUrl` lanca ao acessar .json se o corpo nao for JSON; protegemos isso.
    let json: unknown = null;
    try {
        json = response.json;
    } catch (_e) {
        json = null;
    }

    return {
        status: response.status,
        json,
        text: response.text,
        arrayBuffer: response.arrayBuffer,
    };
};

export default class PhpSyncPlugin extends Plugin {
    settings!: PluginSettings;
    client!: SyncClient;
    private statusBar?: HTMLElement;
    private autoSyncIntervalId?: number;
    private syncing = false;
    private debouncedSync?: () => void;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.client = new SyncClient(
            obsidianHttp,
            this.settings.serverUrl,
            this.settings.token,
            this.settings.vaultId,
        );
        // Re-autentica automaticamente quando o token expira (401).
        this.client.setOnUnauthorized(async () => {
            if (this.settings.username && this.settings.password) {
                await this.authenticate();
            }
        });

        // Icone na barra lateral (Ribbon).
        this.addRibbonIcon("refresh-cw", "Iniciar Sincronizacao", () => {
            void this.runSync();
        });

        // Comando na paleta de comandos.
        this.addCommand({
            id: "start-sync",
            name: "Iniciar Sincronizacao",
            callback: () => {
                void this.runSync();
            },
        });

        this.addSettingTab(new PhpSyncSettingTab(this.app, this));

        // Barra de status.
        this.statusBar = this.addStatusBarItem();
        this.setStatus("PHP Sync: ocioso");

        // Auto-sync por intervalo (reconfigurado quando as settings mudam).
        this.setupAutoSyncInterval();

        // Auto-sync ao alterar arquivos (com debounce de 5s).
        this.debouncedSync = debounce(() => void this.runSync(), 5000, true);
        const onChange = () => {
            // Ignora eventos gerados pelas próprias escritas do sync (evita loop).
            if (this.syncing) return;
            if (this.settings.syncOnChange) this.debouncedSync?.();
        };
        this.registerEvent(this.app.vault.on("modify", onChange));
        this.registerEvent(this.app.vault.on("create", onChange));
        this.registerEvent(this.app.vault.on("delete", onChange));
        this.registerEvent(this.app.vault.on("rename", onChange));

        // Auto-sync no startup, após o layout carregar.
        if (this.settings.syncOnStartup) {
            this.app.workspace.onLayoutReady(() => void this.runSync());
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        if (this.client) {
            this.client.setServerUrl(this.settings.serverUrl);
            this.client.setToken(this.settings.token);
            this.client.setVaultId(this.settings.vaultId);
        }
        this.setupAutoSyncInterval();
    }

    /** (Re)configura o timer de auto-sync conforme `syncIntervalMinutes`. */
    private setupAutoSyncInterval(): void {
        if (this.autoSyncIntervalId !== undefined) {
            window.clearInterval(this.autoSyncIntervalId);
            this.autoSyncIntervalId = undefined;
        }
        const minutes = this.settings.syncIntervalMinutes;
        if (minutes > 0) {
            this.autoSyncIntervalId = window.setInterval(
                () => void this.runSync(),
                minutes * 60_000,
            );
            this.registerInterval(this.autoSyncIntervalId);
        }
    }

    private setStatus(text: string): void {
        this.statusBar?.setText(text);
    }

    /** Autentica usando as credenciais salvas e persiste o token. */
    async authenticate(): Promise<void> {
        this.client.setServerUrl(this.settings.serverUrl);
        const token = await this.client.authenticate(
            this.settings.username,
            this.settings.password,
        );
        this.settings.token = token;
        await this.saveSettings();
    }

    /** Executa o ciclo completo de sincronizacao (upload + download + exclusões). */
    async runSync(): Promise<void> {
        if (this.settings.token === "") {
            new Notice("PHP Sync: autentique-se nas configuracoes primeiro.");
            return;
        }
        if (this.syncing) {
            return; // evita execuções concorrentes
        }
        this.syncing = true;

        const exclude = parsePatterns(this.settings.excludePatterns);
        const include = parsePatterns(this.settings.includePatterns);
        const keep = (path: string) => shouldSync(path, exclude, include);

        const notice = new Notice("PHP Sync: sincronizando...", 0);
        this.setStatus("PHP Sync: sincronizando…");
        try {
            const localFiles = this.app.vault
                .getFiles()
                .filter((file) => keep(file.path));
            const byPath = new Map(localFiles.map((file) => [file.path, file]));

            // Metadados locais (hash + mtime), reutilizando o cache para não
            // re-hashar arquivos cujo mtime e tamanho não mudaram.
            const localMeta: FileMeta[] = [];
            const nextHashCache: Record<string, HashCacheEntry> = {};
            for (const file of localFiles) {
                const cached = this.settings.hashCache[file.path];
                let hash: string;
                if (
                    cached &&
                    cached.mtime === file.stat.mtime &&
                    cached.size === file.stat.size
                ) {
                    hash = cached.hash;
                } else {
                    const buffer = await this.app.vault.readBinary(file);
                    hash = await sha256(buffer);
                }
                nextHashCache[file.path] = {
                    mtime: file.stat.mtime,
                    size: file.stat.size,
                    hash,
                };
                localMeta.push({ path: file.path, hash, mtime: file.stat.mtime });
            }
            // Substitui o cache (descartando entradas de arquivos que sumiram).
            this.settings.hashCache = nextHashCache;

            const remoteFiles = await this.client.manifest();
            const remoteMeta: FileMeta[] = remoteFiles
                .filter((f) => keep(f.path))
                .map((f) => ({ path: f.path, hash: f.hash, mtime: f.mtime }));

            const plan = planSync(localMeta, remoteMeta, this.settings.lastSync);

            const total =
                plan.toUpload.length +
                plan.toDownload.length +
                plan.toDeleteRemote.length +
                plan.toDeleteLocal.length;
            let done = 0;
            const tick = () => this.setStatus(`PHP Sync: ${++done}/${total}`);

            // Aplica o plano. Uploads vão em lotes (menos requisições).
            const UPLOAD_BATCH = 25;
            for (let i = 0; i < plan.toUpload.length; i += UPLOAD_BATCH) {
                const slice = plan.toUpload.slice(i, i + UPLOAD_BATCH);
                const payload: { path: string; content: string }[] = [];
                for (const path of slice) {
                    const file = byPath.get(path);
                    if (!file) continue;
                    const buffer = await this.app.vault.readBinary(file);
                    payload.push({ path, content: arrayBufferToBase64(buffer) });
                }
                await this.client.uploadBatch(payload);
                payload.forEach(() => tick());
            }
            for (const path of plan.toDownload) {
                const contentBase64 = await this.client.download(path);
                await this.writeFile(path, base64ToArrayBuffer(contentBase64));
                tick();
            }
            for (const path of plan.toDeleteRemote) {
                await this.client.deleteFile(path);
                tick();
            }
            for (const path of plan.toDeleteLocal) {
                await this.deleteLocalFile(path);
                tick();
            }

            // Persiste o novo estado convergido para o próximo delta.
            this.settings.lastSync = buildLastSync(localMeta, remoteMeta, plan);
            await this.saveSettings();

            notice.hide();
            const summary =
                `${plan.toUpload.length} enviado(s), ` +
                `${plan.toDownload.length} baixado(s), ` +
                `${plan.toDeleteRemote.length + plan.toDeleteLocal.length} removido(s)`;
            new Notice(`PHP Sync: concluido. ${summary}.`);
            this.setStatus(`PHP Sync: ${new Date().toLocaleTimeString()} ✔`);
        } catch (error) {
            notice.hide();
            this.setStatus("PHP Sync: erro ✗");
            const message =
                error instanceof SyncError
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : String(error);
            new Notice(`PHP Sync: erro - ${message}`);
            console.error("PHP Sync:", error);
        } finally {
            this.syncing = false;
        }
    }

    /** Grava um arquivo no cofre, criando as pastas necessarias. */
    private async writeFile(path: string, data: ArrayBuffer): Promise<void> {
        const normalized = normalizePath(path);

        await this.ensureFolder(normalized);

        const existing = this.app.vault.getAbstractFileByPath(normalized);
        if (existing instanceof TFile) {
            await this.app.vault.modifyBinary(existing, data);
        } else {
            await this.app.vault.createBinary(normalized, data);
        }
    }

    /** Remove um arquivo do cofre local (se ainda existir). */
    private async deleteLocalFile(path: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
        if (file instanceof TFile) {
            await this.app.fileManager.trashFile(file);
        }
    }

    /** Garante que a pasta-pai do caminho exista. */
    private async ensureFolder(path: string): Promise<void> {
        const slash = path.lastIndexOf("/");
        if (slash <= 0) return;

        const folder = path.slice(0, slash);
        if (this.app.vault.getAbstractFileByPath(folder)) return;

        try {
            await this.app.vault.createFolder(folder);
        } catch (_e) {
            // Pasta criada concorrentemente — ignoramos.
        }
    }
}

class PhpSyncSettingTab extends PluginSettingTab {
    constructor(
        app: App,
        private readonly plugin: PhpSyncPlugin,
    ) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "PHP Sync — Configuracoes" });

        new Setting(containerEl)
            .setName("URL do servidor")
            .setDesc("Endereco do backend (ex.: http://localhost:8080).")
            .addText((text) =>
                text
                    .setPlaceholder("http://localhost:8080")
                    .setValue(this.plugin.settings.serverUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.serverUrl = value.trim();
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Usuario")
            .addText((text) =>
                text
                    .setPlaceholder("admin")
                    .setValue(this.plugin.settings.username)
                    .onChange(async (value) => {
                        this.plugin.settings.username = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Senha")
            .addText((text) => {
                text.inputEl.type = "password";
                text
                    .setPlaceholder("senha")
                    .setValue(this.plugin.settings.password)
                    .onChange(async (value) => {
                        this.plugin.settings.password = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("ID do cofre")
            .setDesc("Permite múltiplos cofres no mesmo servidor. Vazio = \"default\".")
            .addText((text) =>
                text
                    .setPlaceholder("default")
                    .setValue(this.plugin.settings.vaultId)
                    .onChange(async (value) => {
                        this.plugin.settings.vaultId = value.trim();
                        await this.plugin.saveSettings();
                    }),
            );

        const status = containerEl.createEl("p", {
            text: this.plugin.settings.token
                ? "Status: autenticado ✔"
                : "Status: nao autenticado",
        });

        new Setting(containerEl)
            .setName("Conexao")
            .setDesc("Autentica no servidor e salva o token.")
            .addButton((button) =>
                button
                    .setButtonText("Testar Conexao / Autenticar")
                    .setCta()
                    .onClick(async () => {
                        button.setDisabled(true);
                        button.setButtonText("Conectando...");
                        try {
                            await this.plugin.authenticate();
                            new Notice("PHP Sync: autenticado com sucesso!");
                            status.setText("Status: autenticado ✔");
                        } catch (error) {
                            const message =
                                error instanceof Error ? error.message : String(error);
                            new Notice(`PHP Sync: falha - ${message}`);
                            status.setText("Status: nao autenticado");
                        } finally {
                            button.setDisabled(false);
                            button.setButtonText("Testar Conexao / Autenticar");
                        }
                    }),
            );

        containerEl.createEl("h3", { text: "Automação" });

        new Setting(containerEl)
            .setName("Sincronizar ao iniciar")
            .setDesc("Dispara uma sincronização quando o Obsidian abre.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.syncOnStartup = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Sincronizar ao alterar arquivos")
            .setDesc("Sincroniza automaticamente (com atraso de 5s) após editar/criar/remover notas.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.syncOnChange)
                    .onChange(async (value) => {
                        this.plugin.settings.syncOnChange = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Intervalo de auto-sync (minutos)")
            .setDesc("0 desativa o sync periódico.")
            .addText((text) =>
                text
                    .setPlaceholder("0")
                    .setValue(String(this.plugin.settings.syncIntervalMinutes))
                    .onChange(async (value) => {
                        const n = Number.parseInt(value, 10);
                        this.plugin.settings.syncIntervalMinutes =
                            Number.isFinite(n) && n > 0 ? n : 0;
                        await this.plugin.saveSettings();
                    }),
            );

        containerEl.createEl("h3", { text: "Filtros" });

        new Setting(containerEl)
            .setName("Excluir (glob)")
            .setDesc("Padrões a ignorar — um por linha. Ex.: .obsidian/  *.tmp")
            .addTextArea((text) =>
                text
                    .setValue(this.plugin.settings.excludePatterns)
                    .onChange(async (value) => {
                        this.plugin.settings.excludePatterns = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Incluir (glob)")
            .setDesc("Se preenchido, só sincroniza o que casar. Vazio = tudo (menos exclusões).")
            .addTextArea((text) =>
                text
                    .setValue(this.plugin.settings.includePatterns)
                    .onChange(async (value) => {
                        this.plugin.settings.includePatterns = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
