/**
 * ConceptSection - Collapsible concept confirmation section
 * Panel Combination Phase 2: Refactored from ConceptConfirmPanel
 */

import React from "react";
import { ExtractedConceptWithMatch } from "@core/types/concept";

export interface ConceptSectionProps {
	// Display state
	isExpanded: boolean;
	onToggleExpand: () => void;

	// Concept data
	extractedConcepts: Array<{
		notePath: string;
		noteTitle: string;
		concepts: ExtractedConceptWithMatch[];
	}>;

	// Progress data
	batchProgress?: {
		totalFiles: number;
		processedFiles: number;
		totalConcepts: number;
		isProcessing: boolean;
	};

	// Callback functions
	onApplyConcepts: (groups: ConceptGroup[]) => Promise<void>;
	onClearConcepts: () => void;
	onRejectConcept: (conceptName: string, notePath: string) => void;
	onApplySingleConcept: (group: ConceptGroup) => Promise<void>;

	// Extraction control
	isBatchProcessing: boolean;
	onStopBatch: () => void;
}

export interface ConceptGroup {
	notePath: string;
	noteTitle: string;
	concepts: ExtractedConceptWithMatch[];
}

export const ConceptSection: React.FC<ConceptSectionProps> = ({
	isExpanded,
	onToggleExpand,
	extractedConcepts,
	batchProgress,
	onApplyConcepts,
	onClearConcepts,
	onRejectConcept,
	onApplySingleConcept,
	isBatchProcessing,
	onStopBatch,
}) => {
	const totalConcepts = extractedConcepts.reduce(
		(sum, g) => sum + g.concepts.length,
		0,
	);

	return (
		<div className="memo-echo-concept-section">
			{/* Collapsible/Expandable Header */}
			<div
				className="memo-echo-concept-header"
				onClick={onToggleExpand}
			>
				<span>💡 概念确认</span>
				<span className="memo-echo-concept-toggle">
					{isExpanded ? "▲" : "▼"}
				</span>
				{totalConcepts > 0 && !batchProgress?.isProcessing && (
					<span className="memo-echo-concept-badge">
						{totalConcepts}个概念 • {extractedConcepts.length}个文件
					</span>
				)}
			</div>

			{/* Collapsed state: Show only progress bar */}
			{!isExpanded && batchProgress?.isProcessing && (
				<div className="memo-echo-collapsed-progress">
					<BatchProgressBar progress={batchProgress} />
				</div>
			)}

			{/* Expanded state: Show full content */}
			{isExpanded && (
				<div className="memo-echo-concept-content">
					{/* Progress bar (still visible) */}
					{batchProgress?.isProcessing && (
						<BatchProgressBar progress={batchProgress} />
					)}

					{/* Concept list */}
					{extractedConcepts.length > 0 && (
						<ConceptListInline
							concepts={extractedConcepts}
							onApply={onApplyConcepts}
							onClear={onClearConcepts}
							onApplySingle={onApplySingleConcept}
							onRejectSingle={onRejectConcept}
							isBatchProcessing={isBatchProcessing}
						/>
					)}

					{/* Stop batch button */}
					{isBatchProcessing && (
						<button
							className="memo-echo-stop-btn"
							onClick={onStopBatch}
						>
							🛑 停止批量提取
						</button>
					)}
				</div>
			)}
		</div>
	);
};

/**
 * ConceptListInline - Inline concept list for confirmation
 * Reused from ConceptConfirmPanel
 */
interface ConceptListInlineProps {
	concepts: Array<{
		notePath: string;
		noteTitle: string;
		concepts: ExtractedConceptWithMatch[];
	}>;
	onApply: (selectedGroups: ConceptGroup[]) => Promise<void>;
	onClear: () => void;
	onApplySingle?: (group: ConceptGroup) => Promise<void>;
	onRejectSingle?: (conceptName: string, notePath: string) => void;
	isBatchProcessing: boolean;
}

const ConceptListInline: React.FC<ConceptListInlineProps> = ({
	concepts,
	onApply,
	onClear,
	onApplySingle,
	onRejectSingle,
	isBatchProcessing,
}) => {
	const [selected, setSelected] = React.useState<Set<string>>(new Set());
	const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set());
	const [isProcessing, setIsProcessing] = React.useState(false);

	// Initialize selection when concepts change
	React.useEffect(() => {
		const allConcepts = new Set(
			concepts.flatMap((g) => g.concepts.map((c) => c.name)),
		);
		const allFiles = new Set(concepts.map((g) => g.notePath));
		setSelected(allConcepts);
		setSelectedFiles(allFiles);
	}, [concepts]);

	const toggleConcept = (conceptName: string) => {
		const newSelected = new Set(selected);
		if (newSelected.has(conceptName)) {
			newSelected.delete(conceptName);
		} else {
			newSelected.add(conceptName);
		}
		setSelected(newSelected);
	};

	const toggleFile = (
		notePath: string,
		fileConcepts: ExtractedConceptWithMatch[],
	) => {
		const newSelectedFiles = new Set(selectedFiles);
		const newSelected = new Set(selected);

		if (newSelectedFiles.has(notePath)) {
			newSelectedFiles.delete(notePath);
			fileConcepts.forEach((c) => newSelected.delete(c.name));
		} else {
			newSelectedFiles.add(notePath);
			fileConcepts.forEach((c) => newSelected.add(c.name));
		}

		setSelectedFiles(newSelectedFiles);
		setSelected(newSelected);
	};

	const handleApply = async () => {
		const filteredGroups = concepts
			.filter((group) => selectedFiles.has(group.notePath))
			.map((group) => ({
				...group,
				concepts: group.concepts.filter((c) => selected.has(c.name)),
			}))
			.filter((group) => group.concepts.length > 0);

		if (filteredGroups.length > 0) {
			await onApply(filteredGroups);
		}
	};

	const handleSelectAll = () => {
		const allConcepts = new Set(
			concepts.flatMap((g) => g.concepts.map((c) => c.name)),
		);
		const allFiles = new Set(concepts.map((g) => g.notePath));
		setSelected(allConcepts);
		setSelectedFiles(allFiles);
	};

	const handleClear = () => {
		setSelected(new Set());
		setSelectedFiles(new Set());
	};

	const handleApplySingle = async (group: ConceptGroup) => {
		setIsProcessing(true);
		try {
			await onApplySingle?.(group);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleRejectSingle = (conceptName: string, notePath: string) => {
		onRejectSingle?.(conceptName, notePath);
	};

	if (concepts.length === 0) return null;

	const totalConcepts = concepts.reduce(
		(sum, g) => sum + g.concepts.length,
		0,
	);

	return (
		<div className="memo-echo-concept-list-inline">
			<div className="memo-echo-concept-list-header">
				<span>
					💡 提取的概念 ({totalConcepts}个 • {concepts.length}个文件)
				</span>
				<div className="memo-echo-concept-actions">
					<button
						onClick={handleApply}
						className="memo-echo-concept-btn memo-echo-concept-btn-primary"
						disabled={selected.size === 0}
					>
						✓ 应用 ({selected.size})
					</button>
					<button
						onClick={handleSelectAll}
						className="memo-echo-concept-btn"
					>
						✓ 全选
					</button>
					<button
						onClick={handleClear}
						className="memo-echo-concept-btn"
					>
						✗ 清空
					</button>
				</div>
			</div>
			{concepts.map((group) => (
				<div key={group.notePath} className="memo-echo-file-group">
					<div className="memo-echo-file-group-header">
						<label className="memo-echo-file-checkbox">
							<input
								type="checkbox"
								checked={selectedFiles.has(group.notePath)}
								onChange={() =>
									toggleFile(group.notePath, group.concepts)
								}
							/>
							<span className="memo-echo-file-title">
								📄 {group.noteTitle} ({group.concepts.length}
								个概念)
							</span>
						</label>
					</div>
					<div className="memo-echo-file-concepts">
						{group.concepts.map((concept, index) => (
							<div
								key={`${concept.name}-${index}`}
								className="memo-echo-concept-item"
							>
								<label className="memo-echo-concept-checkbox">
									<input
										type="checkbox"
										checked={selected.has(concept.name)}
										onChange={() =>
											toggleConcept(concept.name)
										}
									/>
									<span className="memo-echo-concept-name">
										[[{concept.name}]]
									</span>
									<span className="memo-echo-concept-meta">
										{Math.round(concept.confidence * 100)}%
									</span>
									<div className="memo-echo-concept-item-actions">
										<button
											className="memo-echo-concept-action-btn memo-echo-concept-approve-btn"
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												handleApplySingle({
													notePath: group.notePath,
													noteTitle: group.noteTitle,
													concepts: [concept],
												});
											}}
											title="应用此概念"
											disabled={isProcessing}
										>
											✓
										</button>
										<button
											className="memo-echo-concept-action-btn memo-echo-concept-reject-btn"
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												handleRejectSingle(
													concept.name,
													group.notePath,
												);
											}}
											title="拒绝此概念"
										>
											✗
										</button>
									</div>
								</label>
								{concept.reason && (
									<div className="memo-echo-concept-reason">
										{concept.reason}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
};

/**
 * BatchProgressBar - Progress bar for batch concept extraction
 * Reused from ConceptConfirmPanel
 */
interface BatchProgressBarProps {
	progress: {
		totalFiles: number;
		processedFiles: number;
		totalConcepts: number;
		isProcessing: boolean;
	};
}

const BatchProgressBar: React.FC<BatchProgressBarProps> = ({ progress }) => {
	const percentage =
		progress.totalFiles > 0
			? Math.round((progress.processedFiles / progress.totalFiles) * 100)
			: 0;

	return (
		<div className="memo-echo-progress-container">
			<div className="memo-echo-progress-bar">
				<div
					className="memo-echo-progress-fill"
					style={{ width: `${percentage}%` }}
				/>
			</div>
			<div className="memo-echo-progress-text">
				<span>
					<span className="memo-echo-progress-spinner">⏳</span>{" "}
					正在批量提取概念...
				</span>
				<span>
					{progress.processedFiles}/{progress.totalFiles} 文件 •{" "}
					{progress.totalConcepts} 个概念
				</span>
			</div>
		</div>
	);
};
