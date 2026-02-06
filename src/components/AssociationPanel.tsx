import React, { useState, useEffect } from "react";
import { NoteAssociation } from "@services/association-engine";
import { ExtractedConceptWithMatch } from "@core/types/concept";

export interface AssociationPanelProps {
    associations: NoteAssociation[];
    isLoading: boolean;
    onAccept: (association: NoteAssociation) => Promise<void>;
    onIgnore: (association: NoteAssociation) => void;
    onOpenFile: (noteId: string) => void;
    onAssociateCurrent: () => Promise<void>;
    onAssociateAll: () => Promise<void>;
    batchProgress?: {
        totalFiles: number;
        processedFiles: number;
        totalConcepts: number;
        isProcessing: boolean;
    };
    extractedConcepts?: Array<{
        notePath: string;
        noteTitle: string;
        concepts: ExtractedConceptWithMatch[];
    }>;
    onApplyConcepts: (
        selectedGroups: Array<{
            notePath: string;
            noteTitle: string;
            concepts: ExtractedConceptWithMatch[];
        }>,
    ) => Promise<void>;
    onClearConcepts: () => void;
    // Per-item concept action callbacks
    onRejectConcept?: (conceptName: string, notePath: string) => void;
    onApplySingleConcept?: (group: {
        notePath: string;
        noteTitle: string;
        concepts: ExtractedConceptWithMatch[];
    }) => Promise<void>;
    isBatchProcessing: boolean;
    onStopBatch: () => void;
}

export const AssociationPanel: React.FC<AssociationPanelProps> = ({
    associations,
    isLoading,
    onAccept,
    onIgnore,
    onOpenFile,
    onAssociateCurrent,
    onAssociateAll,
    batchProgress,
    extractedConcepts,
    onApplyConcepts,
    onClearConcepts,
    onRejectConcept,
    onApplySingleConcept,
    isBatchProcessing,
    onStopBatch,
}) => {
    const handleApplySingleConceptWrapper = async (
        conceptName: string,
        notePath: string,
    ) => {
        if (onApplySingleConcept) {
            // Use the dedicated single-concept handler
            const group = extractedConcepts?.find(
                (g) => g.notePath === notePath,
            );
            const concept = group?.concepts.find(
                (c: any) => c.name === conceptName,
            );
            if (group && concept) {
                await onApplySingleConcept({
                    notePath: group.notePath,
                    noteTitle: group.noteTitle,
                    concepts: [concept],
                });
            }
        } else {
            // Fallback to batch apply (triggers full refresh)
            const group = extractedConcepts?.find(
                (g) => g.notePath === notePath,
            );
            const concept = group?.concepts.find(
                (c: any) => c.name === conceptName,
            );
            if (concept && group) {
                await onApplyConcepts([
                    {
                        notePath: group.notePath,
                        noteTitle: group.noteTitle,
                        concepts: [concept],
                    },
                ]);
            }
        }
    };

    const handleRejectSingleConcept = (
        conceptName: string,
        notePath: string,
    ) => {
        onRejectConcept?.(conceptName, notePath);
    };
    return (
        <div className="memo-echo-association-panel">
            {/* Header */}
            <div className="memo-echo-panel-header">
                <h3>🔗 关联建议</h3>
                <div className="memo-echo-concept-actions">
                    <button
                        className="memo-echo-icon-btn"
                        onClick={onAssociateCurrent}
                        disabled={isLoading || isBatchProcessing}
                        title="提取当前页面的概念和创建关联"
                    >
                        📄
                    </button>
                    <button
                        className="memo-echo-icon-btn"
                        onClick={
                            isBatchProcessing ? onStopBatch : onAssociateAll
                        }
                        disabled={isLoading}
                        title={
                            isBatchProcessing
                                ? "停止批量提取"
                                : "批量提取所有页面的概念和创建关联"
                        }
                    >
                        {isBatchProcessing ? "🛑" : "📚"}
                    </button>
                </div>
            </div>

            {/* 进度条 */}
            {batchProgress?.isProcessing && (
                <BatchProgressBar progress={batchProgress} />
            )}

            {/* 关联列表 */}
            {associations && associations.length > 0 && (
                <AssociationList
                    associations={associations}
                    onAccept={onAccept}
                    onIgnore={onIgnore}
                    onOpenFile={onOpenFile}
                />
            )}

            {/* 概念列表 */}
            {extractedConcepts && extractedConcepts.length > 0 && (
                <ConceptListInline
                    concepts={extractedConcepts}
                    onApply={onApplyConcepts}
                    onClear={onClearConcepts}
                    onApplySingle={handleApplySingleConceptWrapper}
                    onRejectSingle={handleRejectSingleConcept}
                />
            )}

            {/* 空状态 */}
            {!isLoading &&
                !batchProgress?.isProcessing &&
                (!extractedConcepts || extractedConcepts.length === 0) && (
                    <div className="memo-echo-empty">
                        <p>暂无未关联的概念</p>
                        <p className="memo-echo-hint">
                            点击 📚 批量提取或 📄 提取当前笔记的概念
                        </p>
                    </div>
                )}
        </div>
    );
};

/**
 * ConceptListInline - Inline concept list in AssociationPanel
 */
interface ConceptListInlineProps {
    concepts: Array<{
        notePath: string;
        noteTitle: string;
        concepts: any[];
    }>;
    onApply: (
        selectedGroups: Array<{
            notePath: string;
            noteTitle: string;
            concepts: any[];
        }>,
    ) => Promise<void>;
    onClear: () => void;
    // Per-item action callbacks
    onApplySingle?: (conceptName: string, notePath: string) => Promise<void>;
    onRejectSingle?: (conceptName: string, notePath: string) => void;
}

const ConceptListInline: React.FC<ConceptListInlineProps> = ({
    concepts,
    onApply,
    onClear,
    onApplySingle,
    onRejectSingle,
}) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [isProcessing, setIsProcessing] = useState(false);

    // Initialize selection when concepts change
    useEffect(() => {
        const allConcepts = new Set(
            concepts.flatMap((g) => g.concepts.map((c: any) => c.name)),
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

    const toggleFile = (notePath: string, fileConcepts: any[]) => {
        const newSelectedFiles = new Set(selectedFiles);
        const newSelected = new Set(selected);

        if (newSelectedFiles.has(notePath)) {
            newSelectedFiles.delete(notePath);
            fileConcepts.forEach((c: any) => newSelected.delete(c.name));
        } else {
            newSelectedFiles.add(notePath);
            fileConcepts.forEach((c: any) => newSelected.add(c.name));
        }

        setSelectedFiles(newSelectedFiles);
        setSelected(newSelected);
    };

    const handleApply = async () => {
        const filteredGroups = concepts
            .filter((group) => selectedFiles.has(group.notePath))
            .map((group) => ({
                ...group,
                concepts: group.concepts.filter((c: any) =>
                    selected.has(c.name),
                ),
            }))
            .filter((group) => group.concepts.length > 0);

        if (filteredGroups.length > 0) {
            await onApply(filteredGroups);
        }
    };

    const handleSelectAll = () => {
        const allConcepts = new Set(
            concepts.flatMap((g) => g.concepts.map((c: any) => c.name)),
        );
        const allFiles = new Set(concepts.map((g) => g.notePath));
        setSelected(allConcepts);
        setSelectedFiles(allFiles);
    };

    const handleClear = () => {
        setSelected(new Set());
        setSelectedFiles(new Set());
    };

    const handleApplySingle = async (conceptName: string, notePath: string) => {
        setIsProcessing(true);
        try {
            await onApplySingle?.(conceptName, notePath);
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
                        {group.concepts.map((concept: any) => (
                            <div
                                key={concept.name}
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
                                                handleApplySingle(
                                                    concept.name,
                                                    group.notePath,
                                                );
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

/**
 * AssociationList - List of note associations
 */
interface AssociationListProps {
    associations: NoteAssociation[];
    onAccept: (association: NoteAssociation) => Promise<void>;
    onIgnore: (association: NoteAssociation) => void;
    onOpenFile: (noteId: string) => void;
}

const AssociationList: React.FC<AssociationListProps> = ({
    associations,
    onAccept,
    onIgnore,
    onOpenFile,
}) => {
    const handleAccept = async (association: NoteAssociation) => {
        await onAccept(association);
    };

    const handleIgnore = (association: NoteAssociation) => {
        onIgnore(association);
    };

    if (associations.length === 0) return null;

    return (
        <div className="memo-echo-association-list">
            <div className="memo-echo-association-list-header">
                <span>🔗 关联建议 ({associations.length}个)</span>
            </div>
            {associations.map((association, index) => (
                <div key={index} className="memo-echo-association-item">
                    <div className="memo-echo-association-notes">
                        <div className="memo-echo-association-note">
                            <span
                                className="memo-echo-association-note-link"
                                onClick={() =>
                                    onOpenFile(association.sourceNoteId)
                                }
                            >
                                📄{" "}
                                {association.sourceNoteTitle ||
                                    association.sourceNoteId}
                            </span>
                        </div>
                        <div className="memo-echo-association-arrow">↔</div>
                        <div className="memo-echo-association-note">
                            <span
                                className="memo-echo-association-note-link"
                                onClick={() =>
                                    onOpenFile(association.targetNoteId)
                                }
                            >
                                📄{" "}
                                {association.targetNoteTitle ||
                                    association.targetNoteId}
                            </span>
                        </div>
                    </div>
                    <div className="memo-echo-association-concepts">
                        {association.sharedConcepts.map((concept) => (
                            <span
                                key={concept}
                                className="memo-echo-association-concept-tag"
                            >
                                [[{concept}]]
                            </span>
                        ))}
                    </div>
                    <div className="memo-echo-association-meta">
                        <span className="memo-echo-association-confidence">
                            置信度: {Math.round(association.confidence * 100)}%
                        </span>
                        {association.vectorSimilarity !== undefined && (
                            <span className="memo-echo-association-similarity">
                                相似度:{" "}
                                {Math.round(association.vectorSimilarity * 100)}
                                %
                            </span>
                        )}
                    </div>
                    <div className="memo-echo-association-actions">
                        <button
                            className="memo-echo-concept-btn memo-echo-concept-btn-primary"
                            onClick={() => handleAccept(association)}
                            title="接受关联并添加概念到两个笔记"
                        >
                            ✓ 接受
                        </button>
                        <button
                            className="memo-echo-concept-btn"
                            onClick={() => handleIgnore(association)}
                            title="忽略此关联"
                        >
                            ✗ 忽略
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};
