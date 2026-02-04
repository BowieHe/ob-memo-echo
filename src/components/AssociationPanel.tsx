/**
 * AssociationPanel - React component for displaying and managing note associations
 * v0.6.0: Smart association discovery UI
 */

import React, { useState, useCallback, useEffect } from "react";
import { NoteAssociation } from "@services/association-engine";

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
        concepts: any[];
    }>;
    onApplyConcepts: (selectedGroups: Array<{
        notePath: string;
        concepts: any[];
    }>) => Promise<void>;
    onClearConcepts: () => void;
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
    isBatchProcessing,
    onStopBatch,
}) => {
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
                        onClick={isBatchProcessing ? onStopBatch : onAssociateAll}
                        disabled={isLoading}
                        title={isBatchProcessing ? "停止批量提取" : "批量提取所有页面的概念和创建关联"}
                    >
                        {isBatchProcessing ? '🛑' : '📚'}
                    </button>
                </div>
            </div>

            {/* 进度条 */}
            {batchProgress?.isProcessing && <BatchProgressBar progress={batchProgress} />}

            {/* 概念列表 */}
            {extractedConcepts && extractedConcepts.length > 0 && (
                <ConceptListInline
                    concepts={extractedConcepts}
                    onApply={onApplyConcepts}
                    onClear={onClearConcepts}
                />
            )}

            {/* 空状态 */}
            {!isLoading && !batchProgress?.isProcessing && (!extractedConcepts || extractedConcepts.length === 0) && (
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
    onApply: (selectedGroups: Array<{
        notePath: string;
        concepts: any[];
    }>) => Promise<void>;
    onClear: () => void;
}

const ConceptListInline: React.FC<ConceptListInlineProps> = ({
    concepts,
    onApply,
    onClear,
}) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

    // Initialize selection when concepts change
    useEffect(() => {
        const allConcepts = new Set(concepts.flatMap(g => g.concepts.map((c: any) => c.name)));
        const allFiles = new Set(concepts.map(g => g.notePath));
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
            .filter(group => selectedFiles.has(group.notePath))
            .map(group => ({
                ...group,
                concepts: group.concepts.filter((c: any) => selected.has(c.name)),
            }))
            .filter(group => group.concepts.length > 0);

        if (filteredGroups.length > 0) {
            await onApply(filteredGroups);
        }
    };

    const handleSelectAll = () => {
        const allConcepts = new Set(concepts.flatMap(g => g.concepts.map((c: any) => c.name)));
        const allFiles = new Set(concepts.map(g => g.notePath));
        setSelected(allConcepts);
        setSelectedFiles(allFiles);
    };

    const handleClear = () => {
        setSelected(new Set());
        setSelectedFiles(new Set());
    };

    if (concepts.length === 0) return null;

    const totalConcepts = concepts.reduce((sum, g) => sum + g.concepts.length, 0);

    return (
        <div className="memo-echo-concept-list-inline">
            <div className="memo-echo-concept-list-header">
                <span>💡 提取的概念 ({totalConcepts}个 • {concepts.length}个文件)</span>
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
            {concepts.map(group => (
                <div key={group.notePath} className="memo-echo-file-group">
                    <div className="memo-echo-file-group-header">
                        <label className="memo-echo-file-checkbox">
                            <input
                                type="checkbox"
                                checked={selectedFiles.has(group.notePath)}
                                onChange={() => toggleFile(group.notePath, group.concepts)}
                            />
                            <span className="memo-echo-file-title">
                                📄 {group.noteTitle} ({group.concepts.length}个概念)
                            </span>
                        </label>
                    </div>
                    <div className="memo-echo-file-concepts">
                        {group.concepts.map((concept: any) => (
                            <div key={concept.name} className="memo-echo-concept-item">
                                <label className="memo-echo-concept-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(concept.name)}
                                        onChange={() => toggleConcept(concept.name)}
                                    />
                                    <span className="memo-echo-concept-name">
                                        [[{concept.name}]]
                                    </span>
                                    <span className="memo-echo-concept-meta">
                                        {Math.round(concept.confidence * 100)}%
                                    </span>
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
    const percentage = progress.totalFiles > 0
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
                    <span className="memo-echo-progress-spinner">⏳</span>
                    {' '}
                    正在批量提取概念...
                </span>
                <span>
                    {progress.processedFiles}/{progress.totalFiles} 文件 • {progress.totalConcepts} 个概念
                </span>
            </div>
        </div>
    );
};
