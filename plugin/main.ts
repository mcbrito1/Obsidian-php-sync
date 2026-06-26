import {
    App,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    requestUrl,
    normalizePath,
} from "obsidian";

import { SyncClient, SyncError } from "./src/SyncClient";
import { planSync } from "./src/syncPlan";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./src/base64";
import {
    DEFAULT_SETTINGS,
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

    async onload(): Promise<void> {
        await this.loadSettings();

        this.client = new SyncClient(
            obsidianHttp,
            this.settings.serverUrl,
            this.settings.token,
        );

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
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        if (this.client) {
            this.client.setServerUrl(this.settings.serverUrl);
            this.client.setToken(this.settings.token);
        }
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

    /** Executa o ciclo completo de sincronizacao (upload + download). */
    async runSync(): Promise<void> {
        if (this.settings.token === "") {
            new Notice("PHP Sync: autentique-se nas configuracoes primeiro.");
            return;
        }

        const notice = new Notice("PHP Sync: sincronizando...", 0);
        try {
            const localFiles = this.app.vault.getFiles();
            const localPaths = localFiles.map((file) => file.path);

            const remoteFiles = await this.client.list();
            const plan = planSync(localPaths, remoteFiles);

            const byPath = new Map(localFiles.map((file) => [file.path, file]));

            // Upload de todos os arquivos locais.
            let uploaded = 0;
            for (const path of plan.toUpload) {
                const file = byPath.get(path);
                if (!file) continue;
                const buffer = await this.app.vault.readBinary(file);
                await this.client.upload(path, arrayBufferToBase64(buffer));
                uploaded++;
            }

            // Download dos arquivos que so existem no servidor.
            let downloaded = 0;
            for (const path of plan.toDownload) {
                const contentBase64 = await this.client.download(path);
                await this.writeFile(path, base64ToArrayBuffer(contentBase64));
                downloaded++;
            }

            notice.hide();
            new Notice(
                `PHP Sync: concluido. ${uploaded} enviado(s), ${downloaded} baixado(s).`,
            );
        } catch (error) {
            notice.hide();
            const message =
                error instanceof SyncError
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : String(error);
            new Notice(`PHP Sync: erro - ${message}`);
            console.error("PHP Sync:", error);
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
    }
}
