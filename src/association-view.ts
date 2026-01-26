/**
 * AssociationView - Obsidian sidebar view for note associations
 * v0.6.0: Smart association discovery and management
 */

import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AssociationPanel } from './components/AssociationPanel';
import { SimpleAssociationEngine, NoteAssociation } from './services/association-engine';
import { AssociationPreferences } from './services/association-preferences';
import type { MemoEchoSettings } from './settings';
import { FrontmatterService } from './services/frontmatter-service';

export const VIEW_TYPE_ASSOCIATION = 'association-view';

export class AssociationView extends ItemView {
    private root: Root | null = null;
    private container: HTMLElement;
    private associationEngine: SimpleAssociationEngine;
    private frontmatterService: FrontmatterService;
    private associationPreferences: AssociationPreferences;
    private getSettings: () => MemoEchoSettings;

    // State
    private associations: NoteAssociation[] = [];
    private isLoading = false;

    constructor(
        leaf: WorkspaceLeaf,
        associationEngine: SimpleAssociationEngine,
        frontmatterService: FrontmatterService,
        associationPreferences: AssociationPreferences,
        getSettings: () => MemoEchoSettings,
    ) {
        super(leaf);
        this.associationEngine = associationEngine;
        this.frontmatterService = frontmatterService;
        this.associationPreferences = associationPreferences;
        this.getSettings = getSettings;
    }

    getViewType(): string {
        return VIEW_TYPE_ASSOCIATION;
    }

    getDisplayText(): string {
        return '🔗 关联建议';
    }

    getIcon(): string {
        return 'link-2';
    }

    async onOpen(): Promise<void> {
        this.container = this.containerEl.children[1] as HTMLElement;
        this.container.empty();
        this.container.addClass('association-view');

        // Initial render
        this.renderReact();

        // Discover associations on open
        await this.refreshAssociations();
    }

    async onClose(): Promise<void> {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
    }

    private renderReact(): void {
        if (this.root) {
            this.root.unmount();
        }

        this.root = createRoot(this.container);
        this.root.render(
            React.createElement(AssociationPanel, {
                associations: this.associations,
                isLoading: this.isLoading,
                onAccept: this.handleAccept,
                onIgnore: this.handleIgnore,
                onDeleteConcept: this.handleDeleteConcept,
                onAcceptAll: this.handleAcceptAll,
                onClearRecent: this.handleClearRecent,
                onRefresh: this.refreshAssociations,
                onOpenFile: this.handleOpenFile,
            })
        );
    }

    /**
     * Refresh associations from the engine
     */
    private refreshAssociations = async (): Promise<void> => {
        this.isLoading = true;
        this.renderReact();

        try {
            // First, index all files if not already indexed
            const files = this.app.vault.getMarkdownFiles();
            const stats = this.associationEngine.getStats();
            const settings = this.getSettings();

            // If we have very few indexed notes, do a quick index
            if (settings.associationAutoScan && stats.totalNotes < files.length * 0.5) {
                new Notice('🔄 正在索引笔记...');

                const limit = Math.max(10, settings.associationAutoScanBatchSize || 50);
                for (const file of files.slice(0, limit)) { // Limit for performance
                    try {
                        const content = await this.app.vault.read(file);
                        await this.associationEngine.indexNote(file.path, content, file.basename);
                    } catch (e) {
                        // Skip files with errors
                    }
                }
            } else if (!settings.associationAutoScan && stats.totalNotes === 0) {
                this.associations = [];
                return;
            }

            // Discover associations
            const associations = await this.associationEngine.discoverAssociations();
            const minConfidence = settings.associationMinConfidence || 0.5;

            // Apply confidence filter
            const confidenceFiltered = associations.filter(
                (association) => association.confidence >= minConfidence,
            );

            // Apply persisted ignores and deleted concepts
            let filtered = this.associationPreferences.filterAssociations(confidenceFiltered);

            // Auto-accept high confidence associations if enabled
            if (settings.associationAutoAccept) {
                const threshold = settings.associationAutoAcceptConfidence || 0.9;
                const autoAccept = filtered.filter((assoc) => assoc.confidence >= threshold);
                const remaining = filtered.filter((assoc) => assoc.confidence < threshold);

                for (const association of autoAccept) {
                    await this.handleAccept(association);
                }

                filtered = remaining;
            }

            this.associations = filtered;

        } catch (error) {
            console.error('Failed to refresh associations:', error);
            new Notice(`❌ 刷新关联失败: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.renderReact();
        }
    };

    /**
     * Accept an association - inject concept wikilinks to both notes
     */
    private handleAccept = async (association: NoteAssociation): Promise<void> => {
        try {
            const sourceFile = this.app.vault.getAbstractFileByPath(association.sourceNoteId) as TFile;
            const targetFile = this.app.vault.getAbstractFileByPath(association.targetNoteId) as TFile;

            if (!sourceFile || !targetFile) {
                new Notice('❌ 找不到关联的笔记文件');
                return;
            }

            // Get existing concepts and add shared concepts to both files
            const sourceConcepts = (await this.frontmatterService.readMemoEchoFields(sourceFile)).me_concepts || [];
            const targetConcepts = (await this.frontmatterService.readMemoEchoFields(targetFile)).me_concepts || [];

            // Extract concept names from wikilinks
            const extractName = (wikilink: string) => {
                const match = wikilink.match(/\[\[.*\/(.+)\]\]/);
                return match ? match[1] : wikilink;
            };

            const existingSourceConcepts = sourceConcepts.map(extractName);
            const existingTargetConcepts = targetConcepts.map(extractName);

            // Add new shared concepts
            const newSourceConcepts = [...new Set([...existingSourceConcepts, ...association.sharedConcepts])];
            const newTargetConcepts = [...new Set([...existingTargetConcepts, ...association.sharedConcepts])];

            // Update frontmatter
            await this.frontmatterService.setConcepts(sourceFile, newSourceConcepts);
            await this.frontmatterService.setConcepts(targetFile, newTargetConcepts);

            const associationId = AssociationPreferences.buildAssociationId(
                association.sourceNoteId,
                association.targetNoteId,
            );
            await this.associationPreferences.ignoreAssociation(associationId);

            // Remove from current list
            this.associations = this.associations.filter(
                (a) => AssociationPreferences.buildAssociationId(a.sourceNoteId, a.targetNoteId) !== associationId,
            );
            this.renderReact();

            new Notice(`✅ 已接受关联，为两个笔记添加了共享概念`);

        } catch (error) {
            console.error('Failed to accept association:', error);
            new Notice(`❌ 接受关联失败: ${error.message}`);
        }
    };

    /**
     * Ignore an association (just removes from view, doesn't persist)
     */
    private handleIgnore = (association: NoteAssociation): void => {
        const associationId = AssociationPreferences.buildAssociationId(
            association.sourceNoteId,
            association.targetNoteId,
        );

        this.associationPreferences.ignoreAssociation(associationId)
            .catch((error) => console.error('Failed to persist ignore:', error));

        this.associations = this.associations.filter(
            (a) => AssociationPreferences.buildAssociationId(a.sourceNoteId, a.targetNoteId) !== associationId,
        );
        this.renderReact();
    };

    /**
     * Delete a concept from an association
     */
    private handleDeleteConcept = (association: NoteAssociation, concept: string): void => {
        const associationId = AssociationPreferences.buildAssociationId(
            association.sourceNoteId,
            association.targetNoteId,
        );

        this.associationPreferences.deleteConcept(associationId, concept)
            .catch((error) => console.error('Failed to persist deleted concept:', error));

        // Remove concept from the association in memory
        const idx = this.associations.findIndex(
            (a) => a.sourceNoteId === association.sourceNoteId &&
                a.targetNoteId === association.targetNoteId
        );

        if (idx !== -1) {
            const updated = { ...this.associations[idx] };
            updated.sharedConcepts = updated.sharedConcepts.filter((c) => c !== concept);

            if (updated.sharedConcepts.length === 0) {
                // No more shared concepts, remove the association
                this.associations.splice(idx, 1);
            } else {
                this.associations[idx] = updated;
            }

            this.renderReact();
        }
    };

    /**
     * Accept all visible associations
     */
    private handleAcceptAll = async (): Promise<void> => {
        try {
            new Notice('🔄 正在接受所有关联...');

            for (const association of this.associations) {
                await this.handleAccept(association);
            }

            new Notice(`✅ 已接受 ${this.associations.length} 个关联`);
            this.associations = [];
            this.renderReact();

        } catch (error) {
            console.error('Failed to accept all:', error);
            new Notice(`❌ 批量接受失败: ${error.message}`);
        }
    };

    /**
     * Clear recently added concepts (last 7 days)
     */
    private handleClearRecent = async (): Promise<void> => {
        try {
            const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const recentFiles = await this.frontmatterService.getFilesIndexedAfter(cutoffDate);

            if (recentFiles.length === 0) {
                new Notice('没有最近添加的概念');
                return;
            }

            const confirmed = confirm(
                `确定要清除最近 7 天添加的概念吗？\n\n将影响 ${recentFiles.length} 个文件。`
            );

            if (!confirmed) return;

            let cleared = 0;
            for (const file of recentFiles) {
                try {
                    await this.frontmatterService.clearMemoEchoFields(file);
                    cleared++;
                } catch (e) {
                    // Skip errors
                }
            }

            new Notice(`✅ 已清除 ${cleared} 个文件的概念`);

            // Refresh associations
            await this.refreshAssociations();

        } catch (error) {
            console.error('Failed to clear recent:', error);
            new Notice(`❌ 清除失败: ${error.message}`);
        }
    };

    /**
     * Open a file in the editor
     */
    private handleOpenFile = (noteId: string): void => {
        const file = this.app.vault.getAbstractFileByPath(noteId);
        if (file && file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            leaf.openFile(file);
        }
    };
}
