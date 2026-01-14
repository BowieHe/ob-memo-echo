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
    Notice,
};
