/**
 * AssociationView - Obsidian sidebar view for note associations
 * v0.6.0: Smart association discovery and management
 * v0.9.0: Added concept confirmation panel
 */

import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AssociationPanel } from '../components/AssociationPanel';
import type { ConfirmedConcept } from '@core/types/concept';
import type { ExtractedConceptWithMatch } from '@core/types/concept';
import { SimpleAssociationEngine, NoteAssociation } from '../services/association-engine';
import { AssociationPreferences } from '../services/association-preferences';
import type { MemoEchoSettings } from './settings';
import { FrontmatterService } from '../services/frontmatter-service';
import { extractWikilinkConcepts } from '../utils/wikilink-utils';
import { VIEW_TYPE_CONCEPT } from '../core/constants';
import { getErrorMessage } from '@utils/error';

export class ConceptView extends ItemView {
    private root: Root | null = null;
    private container!: HTMLElement;
    private associationEngine: SimpleAssociationEngine;
    private frontmatterService: FrontmatterService;
    private associationPreferences: AssociationPreferences;
    private getSettings: () => MemoEchoSettings;
    private handleCurrentFileAssociation: () => Promise<void>;
    private handleAllFilesAssociation: () => Promise<void>;

    // State
    private associations: NoteAssociation[] = [];
    private isLoading = false;

    // Batch extraction state
    private extractedConcepts: Array<{
        notePath: string;
        noteTitle: string;
        concepts: ExtractedConceptWithMatch[];
    }> = [];
    private batchProgress: {
        totalFiles: number;
        processedFiles: number;
        totalConcepts: number;
        isProcessing: boolean;
    } | undefined;
    private batchProgressEventListener: ((event: WindowEventMap['memo-echo:batch-progress']) => void) | null = null;
    private batchIncrementEventListener: ((event: WindowEventMap['memo-echo:batch-increment']) => void) | null = null;
    private batchStopEventListener: ((event: WindowEventMap['memo-echo:batch-stop']) => void) | null = null;
    private isBatchProcessing = false;
    private conceptEventListener: ((event: WindowEventMap['memo-echo:concepts-extracted']) => void) | null = null;

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
        return VIEW_TYPE_CONCEPT;
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
        this.container.addClass('concept-view');

        // Initial render
        this.renderReact();

        // v0.9.0: Setup concept extraction event listener
        this.setupConceptEventListener();

        await this.refreshAssociations({ scan: false });
    }

    async onClose(): Promise<void> {
        if (this.conceptEventListener) {
            window.removeEventListener('memo-echo:concepts-extracted', this.conceptEventListener);
        }

        if (this.batchProgressEventListener) {
            window.removeEventListener('memo-echo:batch-progress', this.batchProgressEventListener);
        }

        if (this.batchIncrementEventListener) {
            window.removeEventListener('memo-echo:batch-increment', this.batchIncrementEventListener);
        }

        if (this.batchStopEventListener) {
            window.removeEventListener('memo-echo:batch-stop', this.batchStopEventListener);
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

        this.root.render(
            React.createElement(AssociationPanel, {
                associations: this.associations,
                isLoading: this.isLoading,
                onAccept: this.handleAccept,
                onIgnore: this.handleIgnore,
                onOpenFile: this.handleOpenFile,
                onAssociateCurrent: this.handleAssociateCurrent,
                onAssociateAll: this.handleAssociateAll,
                extractedConcepts: this.extractedConcepts,
                onApplyConcepts: this.handleConceptsBatchApply,
                onClearConcepts: this.handleConceptsClear,
                onRejectConcept: this.handleRejectConcept,
                onApplySingleConcept: this.handleSingleConceptApply,
                isBatchProcessing: this.isBatchProcessing,
                onStopBatch: this.handleStopBatch,
            })
        );
    }

    /**
     * Refresh associations from the engine
     */
    public refreshAssociations = async (options: { scan: boolean }): Promise<void> => {
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
                await this.scanAllFiles(files, settings.association.associationAutoScanBatchSize || 50);
            }

            // Discover associations
            const associations = await this.associationEngine.discoverAssociations();
            const minConfidence = settings.association.associationMinConfidence || 0.5;

            // Apply confidence filter
            const confidenceFiltered = associations.filter(
                (association) => association.confidence >= minConfidence,
            );

            // Apply persisted ignores and deleted concepts
            let filtered = this.associationPreferences.filterAssociations(confidenceFiltered);

            // Auto-accept high confidence associations if enabled
            if (settings.association.associationAutoAccept) {
                const threshold = settings.association.associationAutoAcceptConfidence || 0.9;
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
            new Notice(`❌ 刷新关联失败: ${getErrorMessage(error)}`);
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
            new Notice(`❌ 接受关联失败: ${getErrorMessage(error)}`);
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
            new Notice(`❌ 批量接受失败: ${getErrorMessage(error)}`);
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
            new Notice(`❌ 清除失败: ${getErrorMessage(error)}`);
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
        this.conceptEventListener = (event) => {
            const { note, concepts } = event.detail;
            this.extractedConcepts = [{
                notePath: note.path,
                noteTitle: note.title,
                concepts: concepts,
            }];
            this.renderReact();
        };

        window.addEventListener('memo-echo:concepts-extracted', this.conceptEventListener);

        // Setup batch increment event listener for real-time updates
        this.batchIncrementEventListener = (event) => {
            const { batch, totalFiles, processedFiles, totalConcepts } = event.detail;

            console.log('[AssociationView] Batch increment received:', {
                resultsCount: batch.length,
                totalFiles,
                processedFiles,
                totalConcepts,
            });

            // Transform results to match extractedConcepts format
            this.extractedConcepts = batch.map(r => ({
                notePath: r.note.path,
                noteTitle: r.note.title,
                concepts: r.concepts,
            }));

            // Update progress state
            this.batchProgress = {
                totalFiles,
                processedFiles,
                totalConcepts,
                isProcessing: processedFiles < totalFiles,
            };

            this.isBatchProcessing = this.batchProgress.isProcessing;

            this.renderReact();
        };

        window.addEventListener('memo-echo:batch-increment', this.batchIncrementEventListener);

        // Setup batch stop event listener
        this.batchStopEventListener = (event) => {
            const { processedFiles, totalConcepts } = event.detail;

            this.isBatchProcessing = false;
            this.renderReact();

            console.log('[AssociationView] Batch extraction stopped:', {
                processedFiles,
                totalConcepts,
            });
        };

        window.addEventListener('memo-echo:batch-stop', this.batchStopEventListener);
    }

    /**
     * Handle batch concepts apply
     */
    private handleConceptsBatchApply = async (groups: Array<{
        notePath: string;
        noteTitle: string;
        concepts: ExtractedConceptWithMatch[];
    }>): Promise<void> => {
        console.log('[AssociationView] Batch concepts to apply:', groups);

        window.dispatchEvent(new CustomEvent('memo-echo:batch-concepts-apply', {
            detail: { groups },
        }));

        this.extractedConcepts = [];
        this.renderReact();
    };

    /**
     * Handle single concept apply (no full refresh)
     */
    private handleSingleConceptApply = async (group: {
        notePath: string;
        noteTitle: string;
        concepts: ExtractedConceptWithMatch[];
    }): Promise<void> => {
        console.log('[AssociationView] Single concept to apply:', group);

        window.dispatchEvent(new CustomEvent('memo-echo:single-concept-apply', {
            detail: { group },
        }));

        // Remove only the applied concept from display, not full refresh
        this.extractedConcepts = this.extractedConcepts
            .map(g => {
                if (g.notePath === group.notePath) {
                    return {
                        ...g,
                        concepts: g.concepts.filter(c => c.name !== group.concepts[0]?.name),
                    };
                }
                return g;
            })
            .filter(g => g.concepts.length > 0);

        this.renderReact();
    };

    /**
     * v0.9.0: Handle concept clear
     */
    private handleConceptsClear = (): void => {
        console.log('[AssociationView] Concepts cleared');
        this.extractedConcepts = [];
        this.renderReact();
    };

    /**
     * Handle rejecting a single concept
     */
    private handleRejectConcept = (conceptName: string, notePath: string): void => {
        console.log('[AssociationView] Rejecting concept:', conceptName, 'from', notePath);

        // Filter out the rejected concept from extractedConcepts
        this.extractedConcepts = this.extractedConcepts
            .map(group => {
                if (group.notePath === notePath) {
                    return {
                        ...group,
                        concepts: group.concepts.filter(c => c.name !== conceptName),
                    };
                }
                return group;
            })
            .filter(group => group.concepts.length > 0);

        this.renderReact();
    };

    /**
     * Handle stop batch
     */
    private handleStopBatch = (): void => {
        console.log('[AssociationView] Stop batch requested');
        window.dispatchEvent(new CustomEvent('memo-echo:batch-stop-request'));
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
