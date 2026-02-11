/**
 * ConceptView - Obsidian sidebar view for concept confirmation
 * v0.7.0: Simplified to concept confirmation only (removed associations)
 */

import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { ConceptConfirmPanel } from "../components/ConceptConfirmPanel";
import type { ExtractedConceptWithMatch } from "@core/types/concept";
import type { MemoEchoSettings } from "./settings";
import { FrontmatterService } from "../services/frontmatter-service";
import { VIEW_TYPE_CONCEPT } from "../core/constants";

export class ConceptView extends ItemView {
	private root: Root | null = null;
	private container!: HTMLElement;
	private frontmatterService: FrontmatterService;
	private getSettings: () => MemoEchoSettings;
	private saveSettings: () => Promise<void>;
	private handleCurrentFileAssociation: () => Promise<void>;
	private handleAllFilesAssociation: () => Promise<void>;

	// State
	private extractedConcepts: Array<{
		notePath: string;
		noteTitle: string;
		concepts: ExtractedConceptWithMatch[];
	}> = [];
	private batchProgress:
		| {
				totalFiles: number;
				processedFiles: number;
				totalConcepts: number;
				isProcessing: boolean;
		  }
		| undefined;
	private batchProgressEventListener:
		| ((event: WindowEventMap["memo-echo:batch-progress"]) => void)
		| null = null;
	private batchIncrementEventListener:
		| ((event: WindowEventMap["memo-echo:batch-increment"]) => void)
		| null = null;
	private batchStopEventListener:
		| ((event: WindowEventMap["memo-echo:batch-stop"]) => void)
		| null = null;
	private isBatchProcessing = false;
	private conceptEventListener:
		| ((event: WindowEventMap["memo-echo:concepts-extracted"]) => void)
		| null = null;

	constructor(
		leaf: WorkspaceLeaf,
		frontmatterService: FrontmatterService,
		getSettings: () => MemoEchoSettings,
		saveSettings: () => Promise<void>,
		handleCurrentFileAssociation: () => Promise<void>,
		handleAllFilesAssociation: () => Promise<void>,
	) {
		super(leaf);
		this.frontmatterService = frontmatterService;
		this.getSettings = getSettings;
		this.saveSettings = saveSettings;
		this.handleCurrentFileAssociation = handleCurrentFileAssociation;
		this.handleAllFilesAssociation = handleAllFilesAssociation;
	}

	getViewType(): string {
		return VIEW_TYPE_CONCEPT;
	}

	getDisplayText(): string {
		return "💡 概念确认";
	}

	getIcon(): string {
		return "lightbulb";
	}

	async onOpen(): Promise<void> {
		// Safe: Use existing container or create fallback
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) {
			console.warn(
				"[ConceptView] Container element not found at children[1], creating fallback container",
			);
			this.container = this.containerEl.createDiv(
				"concept-view-container",
			);
		} else {
			this.container = container;
			this.container.empty();
			this.container.addClass("concept-view");
		}

		// Initial render
		this.renderReact();

		// Setup concept extraction event listener
		this.setupConceptEventListener();
	}

	async onClose(): Promise<void> {
		if (this.conceptEventListener) {
			window.removeEventListener(
				"memo-echo:concepts-extracted",
				this.conceptEventListener,
			);
		}

		if (this.batchProgressEventListener) {
			window.removeEventListener(
				"memo-echo:batch-progress",
				this.batchProgressEventListener,
			);
		}

		if (this.batchIncrementEventListener) {
			window.removeEventListener(
				"memo-echo:batch-increment",
				this.batchIncrementEventListener,
			);
		}

		if (this.batchStopEventListener) {
			window.removeEventListener(
				"memo-echo:batch-stop",
				this.batchStopEventListener,
			);
		}

		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	private renderReact(): void {
		try {
			if (!this.container) {
				console.error(
					"[ConceptView] Container is null, cannot mount React component",
				);
				return;
			}

			if (this.root) {
				this.root.unmount();
			}

			this.root = createRoot(this.container);

			this.root.render(
				React.createElement(ConceptConfirmPanel, {
					extractedConcepts: this.extractedConcepts,
					onApplyConcepts: this.handleConceptsBatchApply,
					onClearConcepts: this.handleConceptsClear,
					onRejectConcept: this.handleRejectConcept,
					onApplySingleConcept: this.handleSingleConceptApply,
					isBatchProcessing: this.isBatchProcessing,
					batchProgress: this.batchProgress,
					onAssociateCurrent: this.handleAssociateCurrent,
					onAssociateAll: this.handleAssociateAll,
					onStopBatch: this.handleStopBatch,
				}),
			);

			console.log(
				"[ConceptView] ✅ React component mounted successfully",
			);
		} catch (error) {
			console.error(
				"[ConceptView] ❌ Failed to mount React component:",
				error,
			);
		}
	}

	/**
	 * v0.7.0: Setup concept extraction event listener
	 */
	private setupConceptEventListener(): void {
		this.conceptEventListener = (event) => {
			const { note, concepts } = event.detail;

			// Deduplicate within the single file's concepts
			const deduplicatedConcepts =
				this.deduplicateConceptsByName(concepts);

			this.extractedConcepts = [
				{
					notePath: note.path,
					noteTitle: note.title,
					concepts: deduplicatedConcepts,
				},
			];
			this.renderReact();
		};

		window.addEventListener(
			"memo-echo:concepts-extracted",
			this.conceptEventListener,
		);

		// Setup batch increment event listener for real-time updates
		this.batchIncrementEventListener = (event) => {
			const { batch, totalFiles, processedFiles, totalConcepts } =
				event.detail;

			this.extractedConcepts = batch.map((r) => ({
				notePath: r.note.path,
				noteTitle: r.note.title,
				// Deduplicate within each file's concepts
				concepts: this.deduplicateConceptsByName(r.concepts),
			}));

			this.batchProgress = {
				totalFiles,
				processedFiles,
				totalConcepts,
				isProcessing: processedFiles < totalFiles,
			};

			this.isBatchProcessing = this.batchProgress.isProcessing;

			this.renderReact();
		};

		window.addEventListener(
			"memo-echo:batch-increment",
			this.batchIncrementEventListener,
		);

		// Setup batch stop event listener
		this.batchStopEventListener = (event) => {
			const { processedFiles, totalConcepts } = event.detail;

			this.isBatchProcessing = false;
			this.renderReact();
		};

		window.addEventListener(
			"memo-echo:batch-stop",
			this.batchStopEventListener,
		);
	}

	/**
	 * Handle batch concepts apply
	 */
	private handleConceptsBatchApply = async (
		groups: Array<{
			notePath: string;
			noteTitle: string;
			concepts: ExtractedConceptWithMatch[];
		}>,
	): Promise<void> => {
		console.log("[ConceptView] Batch concepts to apply:", groups);

		window.dispatchEvent(
			new CustomEvent("memo-echo:batch-concepts-apply", {
				detail: { groups },
			}),
		);

		this.extractedConcepts = [];
		this.renderReact();
	};

	/**
	 * Handle single concept apply
	 */
	private handleSingleConceptApply = async (group: {
		notePath: string;
		noteTitle: string;
		concepts: ExtractedConceptWithMatch[];
	}): Promise<void> => {
		console.log("[ConceptView] Single concept to apply:", group);

		window.dispatchEvent(
			new CustomEvent("memo-echo:single-concept-apply", {
				detail: { group },
			}),
		);

		// Remove only the applied concept from display
		this.extractedConcepts = this.extractedConcepts
			.map((g) => {
				if (g.notePath === group.notePath) {
					return {
						...g,
						concepts: g.concepts.filter(
							(c) => c.name !== group.concepts[0]?.name,
						),
					};
				}
				return g;
			})
			.filter((g) => g.concepts.length > 0);

		this.renderReact();
	};

	/**
	 * Handle concept clear
	 */
	private handleConceptsClear = (): void => {
		console.log("[ConceptView] Concepts cleared");
		this.extractedConcepts = [];
		this.renderReact();
	};

	/**
	 * Handle rejecting a single concept
	 */
	private handleRejectConcept = (
		conceptName: string,
		notePath: string,
	): void => {
		console.log(
			"[ConceptView] Rejecting concept:",
			conceptName,
			"from",
			notePath,
		);

		this.extractedConcepts = this.extractedConcepts
			.map((group) => {
				if (group.notePath === notePath) {
					return {
						...group,
						concepts: group.concepts.filter(
							(c) => c.name !== conceptName,
						),
					};
				}
				return group;
			})
			.filter((group) => group.concepts.length > 0);

		this.renderReact();
	};

	/**
	 * Handle stop batch
	 */
	private handleStopBatch = (): void => {
		console.log("[ConceptView] Stop batch requested");
		window.dispatchEvent(new CustomEvent("memo-echo:batch-stop-request"));
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
	/**
	 * Deduplicate concepts by normalized name within a single file
	 */
	private deduplicateConceptsByName(
		concepts: ExtractedConceptWithMatch[],
	): ExtractedConceptWithMatch[] {
		const conceptMap = new Map<string, ExtractedConceptWithMatch>();

		for (const concept of concepts) {
			// Normalize name: trim and lowercase for deduplication
			const normalizedName = concept.name.trim().toLowerCase();
			const existing = conceptMap.get(normalizedName);

			if (!existing) {
				conceptMap.set(normalizedName, concept);
			} else if (concept.confidence > existing.confidence) {
				// Keep the higher confidence one, merge reasons
				const reasons = new Set<string>();
				if (existing.reason?.trim())
					reasons.add(existing.reason.trim());
				if (concept.reason?.trim()) reasons.add(concept.reason.trim());
				conceptMap.set(normalizedName, {
					...concept,
					reason: Array.from(reasons).join("; "),
				});
			} else {
				// Keep existing but merge reasons
				const reasons = new Set<string>();
				if (existing.reason?.trim())
					reasons.add(existing.reason.trim());
				if (concept.reason?.trim()) reasons.add(concept.reason.trim());
				existing.reason = Array.from(reasons).join("; ");
			}
		}

		return Array.from(conceptMap.values());
	}

	private handleAssociateAll = async (): Promise<void> => {
		if (this.handleAllFilesAssociation) {
			await this.handleAllFilesAssociation();
		}
	};
}
