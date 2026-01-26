/**
 * AssociationPanel - React component for displaying and managing note associations
 * v0.6.0: Smart association discovery UI
 */

import React, { useState, useCallback } from "react";
import { NoteAssociation } from "../services/association-engine";

export interface AssociationPanelProps {
    associations: NoteAssociation[];
    isLoading: boolean;
    onAccept: (association: NoteAssociation) => Promise<void>;
    onIgnore: (association: NoteAssociation) => void;
    onDeleteConcept: (association: NoteAssociation, concept: string) => void;
    onAcceptAll: () => Promise<void>;
    onClearRecent: () => Promise<void>;
    onRefresh: () => Promise<void>;
    onOpenFile: (noteId: string) => void;
}

export const AssociationPanel: React.FC<AssociationPanelProps> = ({
    associations,
    isLoading,
    onAccept,
    onIgnore,
    onDeleteConcept,
    onAcceptAll,
    onClearRecent,
    onRefresh,
    onOpenFile,
}) => {
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    const handleAccept = useCallback(
        async (association: NoteAssociation) => {
            const id = `${association.sourceNoteId}-${association.targetNoteId}`;
            setProcessingIds((prev) => new Set(prev).add(id));
            try {
                await onAccept(association);
            } finally {
                setProcessingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }
        },
        [onAccept],
    );

    const handleIgnore = useCallback(
        (association: NoteAssociation) => {
            onIgnore(association);
        },
        [onIgnore],
    );

    const handleAcceptAll = useCallback(async () => {
        setProcessingIds(
            new Set(
                associations.map(
                    (a) => `${a.sourceNoteId}-${a.targetNoteId}`,
                ),
            ),
        );
        try {
            await onAcceptAll();
        } finally {
            setProcessingIds(new Set());
        }
    }, [onAcceptAll, associations]);

    return (
        <div className="memo-echo-association-panel">
            <div className="memo-echo-panel-header">
                <h3>🔗 关联建议</h3>
                <button
                    className="memo-echo-icon-btn"
                    onClick={onRefresh}
                    disabled={isLoading}
                    title="刷新关联"
                >
                    🔄
                </button>
            </div>

            {isLoading && (
                <div className="memo-echo-loading">
                    <span className="memo-echo-spinner">⏳</span>
                    正在发现关联...
                </div>
            )}

            {!isLoading && associations.length === 0 && (
                <div className="memo-echo-empty">
                    <p>暂无关联建议</p>
                    <p className="memo-echo-hint">
                        索引更多笔记后，AI 将自动发现共享概念的笔记对
                    </p>
                </div>
            )}

            {!isLoading && associations.length > 0 && (
                <>
                    <div className="memo-echo-association-count">
                        发现 {associations.length} 个潜在关联
                    </div>

                    <div className="memo-echo-association-list">
                        {associations.map((association) => (
                            <AssociationCard
                                key={`${association.sourceNoteId}-${association.targetNoteId}`}
                                association={association}
                                isProcessing={processingIds.has(
                                    `${association.sourceNoteId}-${association.targetNoteId}`,
                                )}
                                onAccept={() => handleAccept(association)}
                                onIgnore={() => handleIgnore(association)}
                                onDeleteConcept={(concept) =>
                                    onDeleteConcept(association, concept)
                                }
                                onOpenFile={onOpenFile}
                            />
                        ))}
                    </div>

                    <div className="memo-echo-bulk-actions">
                        <button
                            className="memo-echo-btn memo-echo-btn-primary"
                            onClick={handleAcceptAll}
                            disabled={isLoading || processingIds.size > 0}
                        >
                            ✅ 接受所有建议
                        </button>
                        <button
                            className="memo-echo-btn memo-echo-btn-warning"
                            onClick={onClearRecent}
                            disabled={isLoading}
                        >
                            🗑️ 清除最近添加
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

interface AssociationCardProps {
    association: NoteAssociation;
    isProcessing: boolean;
    onAccept: () => void;
    onIgnore: () => void;
    onDeleteConcept: (concept: string) => void;
    onOpenFile: (noteId: string) => void;
}

const AssociationCard: React.FC<AssociationCardProps> = ({
    association,
    isProcessing,
    onAccept,
    onIgnore,
    onDeleteConcept,
    onOpenFile,
}) => {
    const sourceTitle =
        association.sourceNoteTitle ||
        association.sourceNoteId.split("/").pop()?.replace(".md", "") ||
        association.sourceNoteId;
    const targetTitle =
        association.targetNoteTitle ||
        association.targetNoteId.split("/").pop()?.replace(".md", "") ||
        association.targetNoteId;

    const confidencePercent = Math.round(association.confidence * 100);

    return (
        <div
            className={`memo-echo-association-card ${isProcessing ? "processing" : ""}`}
        >
            <div className="memo-echo-card-header">
                <div className="memo-echo-note-pair">
                    <span
                        className="memo-echo-note-link"
                        onClick={() => onOpenFile(association.sourceNoteId)}
                        title={association.sourceNoteId}
                    >
                        {sourceTitle}
                    </span>
                    <span className="memo-echo-arrow">↔</span>
                    <span
                        className="memo-echo-note-link"
                        onClick={() => onOpenFile(association.targetNoteId)}
                        title={association.targetNoteId}
                    >
                        {targetTitle}
                    </span>
                </div>
                <span className="memo-echo-confidence-badge" title="关联置信度">
                    {confidencePercent}%
                </span>
            </div>

            <div className="memo-echo-shared-concepts">
                <span className="memo-echo-concepts-label">共享概念：</span>
                {association.sharedConcepts.map((concept) => (
                    <span key={concept} className="memo-echo-concept-tag">
                        {concept}
                        <button
                            className="memo-echo-concept-delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteConcept(concept);
                            }}
                            title="删除此概念"
                        >
                            ×
                        </button>
                    </span>
                ))}
            </div>

            <div className="memo-echo-card-actions">
                <button
                    className="memo-echo-btn memo-echo-btn-small memo-echo-btn-success"
                    onClick={onAccept}
                    disabled={isProcessing}
                >
                    {isProcessing ? "处理中..." : "接受"}
                </button>
                <button
                    className="memo-echo-btn memo-echo-btn-small"
                    onClick={onIgnore}
                    disabled={isProcessing}
                >
                    忽略
                </button>
            </div>
        </div>
    );
};

export default AssociationPanel;
