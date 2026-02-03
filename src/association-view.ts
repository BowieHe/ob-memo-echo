/**
 * AssociationView - Obsidian sidebar view for note associations
 * v0.6.0: Smart association discovery and management
 * v0.9.0: Added concept confirmation panel
 */

import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AssociationPanel } from './components/AssociationPanel';
import { ConceptConfirmationPanel } from './components/ConceptConfirmationPanel';
import type { ConfirmedConcept } from '@core/types/concept';
import type { ExtractedConceptWithMatch } from '@core/types/concept';
import { SimpleAssociationEngine, NoteAssociation } from './services/association-engine';
import { AssociationPreferences } from './services/association-preferences';
import type { MemoEchoSettings } from './settings';
import { FrontmatterService } from './services/frontmatter-service';
import { extractWikilinkConcepts } from './utils/wikilink-utils';
import { VIEW_TYPE_ASSOCIATION } from './core/constants';

export class AssociationView extends ItemView {
    private root: Root | null = null;
    private container: HTMLElement;
    private associationEngine: SimpleAssociationEngine;
    private frontmatterService: FrontmatterService;
    private associationPreferences: AssociationPreferences;
    private getSettings: () => MemoEchoSettings;
    private handleCurrentFileAssociation: () => Promise<void>;
    private handleAllFilesAssociation: () => Promise<void>;

    // State
    private associations: NoteAssociation[] = [];
    private isLoading = false;

    // v0.9.0: Concept confirmation state
    private extractedConcepts: ExtractedConceptWithMatch[] = [];
    private currentNote: { path: string; title: string } | null = null;
    private conceptEventListener: ((event: CustomEvent<any>) => void) | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        associationEngine: SimpleAssociationEngine,
        frontmatterService: FrontmatterService,
        associationPreferences: AssociationPreferences,
        getSettings: () => MemoEchoSettings,
        handleCurrentFileAssociation: () => Promise<void>,
        handleAllFilesAssociation: () => Promise<void>,
    ) {
        super(leaf);
        this.associationEngine = associationEngine;
        this.frontmatterService = frontmatterService;
        this.associationPreferences = associationPreferences;
        this.getSettings = getSettings;
        this.handleCurrentFileAssociation = handleCurrentFileAssociation;
        this.handleAllFilesAssociation = handleAllFilesAssociation;
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

        // v0.9.0: Setup concept extraction event listener
        this.setupConceptEventListener();

        await this.refreshAssociations({ scan: false });
    }

    async onClose(): Promise<void> {
        // v0.9.0: Clean up concept event listener
        if (this.conceptEventListener) {
            window.removeEventListener('memo-echo:concepts-extracted', this.conceptEventListener);
        }

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

        // Build the children array
        const children: React.ReactElement[] = [];

        // v0.9.0: Add concept confirmation panel if concepts are available
        if (this.currentNote && this.extractedConcepts.length > 0) {
            children.push(
                React.createElement(ConceptConfirmationPanel, {
                    key: 'concept-confirmation',
                    notePath: this.currentNote.path,
                    noteTitle: this.currentNote.title,
                    extractedConcepts: this.extractedConcepts,
                    onApply: this.handleConceptsApply,
                    onSkip: this.handleConceptsSkip,
                    onClear: this.handleConceptsClear,
                })
            );
        }

        // Add association panel
        children.push(
            React.createElement(AssociationPanel, {
                key: 'association',
                associations: this.associations,
                isLoading: this.isLoading,
                onAccept: this.handleAccept,
                onIgnore: this.handleIgnore,
                onDeleteConcept: this.handleDeleteConcept,
                onAcceptAll: this.handleAcceptAll,
                onClearRecent: this.handleClearRecent,
                onOpenFile: this.handleOpenFile,
                onAssociateCurrent: this.handleAssociateCurrent,
                onAssociateAll: this.handleAssociateAll,
            })
        );

        // Render with a container div
        this.root.render(
            React.createElement('div', { className: 'association-view-content' }, children)
        );
    }

    /**
     * Refresh associations from the engine
     */
    private refreshAssociations = async (options: { scan: boolean }): Promise<void> => {
        this.isLoading = true;
        this.renderReact();

        try {
            const files = this.app.vault.getMarkdownFiles();
            const stats = this.associationEngine.getStats();
            const settings = this.getSettings();

            if (!options.scan && stats.totalNotes === 0) {
                this.associations = [];
                return;
            }

            if (options.scan) {
                await this.scanAllFiles(files, settings.associationAutoScanBatchSize || 50);
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

    private async scanAllFiles(files: TFile[], batchSize: number): Promise<void> {
        const safeBatchSize = Math.max(5, batchSize || 50);
        new Notice('🔄 正在扫描关联...');

        this.associationEngine.clearIndex();
        let indexedCount = 0;

        for (let i = 0; i < files.length; i += safeBatchSize) {
            const batch = files.slice(i, i + safeBatchSize);

            for (const file of batch) {
                try {
                    // Check if file needs reindexing using me_indexed_at
                    const fields = await this.frontmatterService.readMemoEchoFields(file);
                    const lastIndexedAt = fields.me_indexed_at ? new Date(fields.me_indexed_at).getTime() : 0;
                    const fileModifiedAt = file.stat.mtime;

                    // Skip if file hasn't been modified since last indexing
                    if (lastIndexedAt >= fileModifiedAt) {
                        // Still load concepts from frontmatter for association engine
                        if (fields.me_concepts && fields.me_concepts.length > 0) {
                            const concepts = extractWikilinkConcepts(fields.me_concepts.join(' '));
                            this.associationEngine.indexNoteConcepts(file.path, concepts);
                        }
                        continue;
                    }

                    // Get concepts for this file
                    const concepts = await this.getConceptsForFile(file);
                    if (concepts.length === 0) {
                        continue;
                    }

                    this.associationEngine.indexNoteConcepts(file.path, concepts);
                    indexedCount++;
                } catch (error) {
                    console.warn(`Failed to process file ${file.path}:`, error);
                    // Skip files with errors
                }
            }
        }

        new Notice(`✅ 扫描完成 (已索引 ${indexedCount} 个文件)`);
    }

    private async getConceptsForFile(file: TFile): Promise<string[]> {
        const fields = await this.frontmatterService.readMemoEchoFields(file);
        const frontmatterConcepts = fields.me_concepts
            ? extractWikilinkConcepts(fields.me_concepts.join(' '))
            : [];

        const content = await this.app.vault.read(file);
        const linkedConcepts = extractWikilinkConcepts(content);

        return Array.from(new Set([...frontmatterConcepts, ...linkedConcepts]));
    }

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

            const sourceContent = await this.app.vault.read(sourceFile);
            const targetContent = await this.app.vault.read(targetFile);
            const sourceLinked = new Set(extractWikilinkConcepts(sourceContent));
            const targetLinked = new Set(extractWikilinkConcepts(targetContent));

            // Extract concept names from wikilinks
            const extractName = (wikilink: string) => {
                const match = wikilink.match(/\[\[.*\/(.+)\]\]/);
                return match ? match[1] : wikilink;
            };

            const existingSourceConcepts = sourceConcepts.map(extractName);
            const existingTargetConcepts = targetConcepts.map(extractName);

            // Add new shared concepts
            const sourceCandidates = association.sharedConcepts.filter((concept) => !sourceLinked.has(concept));
            const targetCandidates = association.sharedConcepts.filter((concept) => !targetLinked.has(concept));

            const newSourceConcepts = [...new Set([...existingSourceConcepts, ...sourceCandidates])];
            const newTargetConcepts = [...new Set([...existingTargetConcepts, ...targetCandidates])];

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
            await this.refreshAssociations({ scan: false });

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

    /**
     * v0.9.0: Setup concept extraction event listener
     */
    private setupConceptEventListener(): void {
        // Create and store the event listener
        this.conceptEventListener = ((event: CustomEvent<{
            note: { path: string; title: string; content: string };
            concepts: ExtractedConceptWithMatch[];
        }>) => {
            const { note, concepts } = event.detail;
            this.currentNote = { path: note.path, title: note.title };
            this.extractedConcepts = concepts;
            this.renderReact();
        }) as EventListener;

        window.addEventListener('memo-echo:concepts-extracted', this.conceptEventListener);
    }

    /**
     * v0.9.0: Handle concept apply
     */
    private handleConceptsApply = async (concepts: ConfirmedConcept[]): Promise<void> => {
        console.log('[AssociationView] Concepts to apply:', concepts);

        // This will be handled by main.ts through the memo-echo:concepts-apply event
        // Just clear the local state here
        this.extractedConcepts = [];
        this.currentNote = null;
        this.renderReact();

        // Dispatch event for main.ts to handle
        window.dispatchEvent(new CustomEvent('memo-echo:concepts-apply', { detail: concepts }));
    };

    /**
     * v0.9.0: Handle concept skip
     */
    private handleConceptsSkip = (): void => {
        console.log('[AssociationView] Concepts skipped');
        this.extractedConcepts = [];
        this.currentNote = null;
        this.renderReact();

        // Dispatch event for main.ts
        window.dispatchEvent(new CustomEvent('memo-echo:concepts-skip'));
    };

    /**
     * v0.9.0: Handle concept clear
     */
    private handleConceptsClear = (): void => {
        console.log('[AssociationView] Concepts cleared');
        this.extractedConcepts = [];
        this.currentNote = null;
        this.renderReact();
    };

    /**
     * Handle association for current file
     */
    private handleAssociateCurrent = async (): Promise<void> => {
        if (this.handleCurrentFileAssociation) {
            await this.handleCurrentFileAssociation();
        }
    };

    /**
     * Handle association for all files
     */
    private handleAssociateAll = async (): Promise<void> => {
        if (this.handleAllFilesAssociation) {
            await this.handleAllFilesAssociation();
        }
    };
}
