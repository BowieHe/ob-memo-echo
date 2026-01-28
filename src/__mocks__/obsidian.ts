/**
 * Mock for Obsidian API
 * Used in Jest tests
 */

export class ItemView {
    app: any;
    leaf: any;
    containerEl: any = {
        children: [null, document.createElement('div')],
    };

    constructor(leaf: any) {
        this.leaf = leaf;
    }

    getViewType(): string {
        return 'mock-view';
    }

    getDisplayText(): string {
        return 'Mock View';
    }

    getIcon(): string {
        return 'document';
    }

    async onOpen() { }
    async onClose() { }
}

export class WorkspaceLeaf {
    view: any;
    async openFile(file: any) { }
    async setViewState(state: any) { }
}

export class TFile {
    path: string = '';
    basename: string = '';
    extension: string = 'md';
    stat: any = { mtime: Date.now() };
}

export class MarkdownView {
    editor: any;
}

export class App {
    workspace: any;
    vault: any;
    metadataCache: any;
    fileManager: any;
}

export class PluginSettingTab {
    app: App;
    containerEl: HTMLElement;

    constructor(app: App) {
        this.app = app;
        this.containerEl = document.createElement('div');
    }

    display(): void { }
}

export class Setting {
    containerEl: HTMLElement;

    constructor(containerEl: HTMLElement) {
        this.containerEl = containerEl;
    }

    setName(_name: string): this { return this; }
    setDesc(_desc: string): this { return this; }
    setHeading(): this { return this; }

    addButton(_cb: (button: any) => void): this { return this; }
    addToggle(_cb: (toggle: any) => void): this { return this; }
    addText(_cb: (text: any) => void): this { return this; }
    addSlider(_cb: (slider: any) => void): this { return this; }
    addDropdown(_cb: (dropdown: any) => void): this { return this; }
}

export class Notice {
    constructor(message: string) {
        // Mock notice
    }
}

export const mockObsidian = {
    ItemView,
    WorkspaceLeaf,
    TFile,
    MarkdownView,
    App,
    PluginSettingTab,
    Setting,
    Notice,
};
