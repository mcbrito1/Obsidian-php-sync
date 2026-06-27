/**
 * Mock mínimo da API do Obsidian para testar `main.ts` em ambiente Node.
 * Cobre apenas o que o plugin usa em tempo de execução.
 */

export class Notice {
    constructor(
        public message: string,
        public timeout?: number,
    ) {}
    setMessage(message: string): void {
        this.message = message;
    }
    hide(): void {}
}

export class TFile {
    path = "";
    stat: { mtime: number; ctime: number; size: number } = {
        mtime: 0,
        ctime: 0,
        size: 0,
    };
}

export class TFolder {
    path = "";
}

export class Plugin {
    constructor(
        public app: unknown,
        public manifest: unknown,
    ) {}
    addRibbonIcon(): { addClass(): void } {
        return { addClass() {} };
    }
    addCommand(): void {}
    addSettingTab(): void {}
    addStatusBarItem(): { setText(): void } {
        return { setText() {} };
    }
    registerInterval(id: number): number {
        return id;
    }
    registerEvent(): void {}
    loadData(): Promise<unknown> {
        return Promise.resolve(null);
    }
    saveData(): Promise<void> {
        return Promise.resolve();
    }
}

export class PluginSettingTab {
    constructor(
        public app: unknown,
        public plugin: unknown,
    ) {}
    containerEl = {
        empty() {},
        createEl() {
            return { setText() {} };
        },
    };
    display(): void {}
}

export class Setting {
    constructor(_containerEl: unknown) {}
    setName(): this {
        return this;
    }
    setDesc(): this {
        return this;
    }
    addText(): this {
        return this;
    }
    addToggle(): this {
        return this;
    }
    addButton(): this {
        return this;
    }
}

export function debounce<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn;
}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/|\/$/g, "");
}

export function requestUrl(): Promise<unknown> {
    return Promise.reject(new Error("requestUrl não deve ser chamado nos testes"));
}
