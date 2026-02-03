import React, { useState, useEffect } from "react";
import type { ExtractedConceptWithMatch, ConfirmedConcept } from "@core/types/concept";

interface ConceptConfirmationPanelProps {
    notePath: string;
    noteTitle: string;
    extractedConcepts: ExtractedConceptWithMatch[];
    onApply: (concepts: ConfirmedConcept[]) => void;
    onSkip: () => void;
    onClear: () => void;
}

export const ConceptConfirmationPanel: React.FC<ConceptConfirmationPanelProps> = ({
    notePath,
    noteTitle,
    extractedConcepts,
    onApply,
    onSkip,
    onClear,
}) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [isExpanded, setIsExpanded] = useState(false);

    // Initialize selected set when concepts change
    useEffect(() => {
        const allSelected = new Set(extractedConcepts.map(c => c.name));
        setSelected(allSelected);
        // Auto-expand when new concepts arrive
        if (extractedConcepts.length > 0) {
            setIsExpanded(true);
        }
    }, [extractedConcepts]);

    const handleToggle = (conceptName: string) => {
        const newSelected = new Set(selected);
        if (newSelected.has(conceptName)) {
            newSelected.delete(conceptName);
        } else {
            newSelected.add(conceptName);
        }
        setSelected(newSelected);
    };

    const handleSelectAll = () => {
        setSelected(new Set(extractedConcepts.map(c => c.name)));
    };

    const handleClear = () => {
        setSelected(new Set());
    };

    const handleApply = () => {
        const confirmed: ConfirmedConcept[] = [];

        for (const concept of extractedConcepts) {
            if (!selected.has(concept.name)) {
                continue;
            }

            const aliases = concept.matchInfo.matchType === 'alias'
                ? [concept.matchInfo.originalTerm]
                : undefined;

            confirmed.push({
                name: concept.matchInfo.matchedConcept,
                isNew: concept.matchInfo.matchType === 'new',
                createPage: false, // Simplified - always false for MVP
                aliases,
            });
        }

        onApply(confirmed);
    };

    const handleCollapse = () => {
        setIsExpanded(false);
        // Treat collapse as skip - clear unprocessed concepts
        onSkip();
    };

    if (extractedConcepts.length === 0) {
        return null;
    }

    return (
        <div className="memo-echo-concept-panel">
            <div
                className="memo-echo-concept-panel-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="memo-echo-concept-panel-title">
                    💡 概念确认 ({extractedConcepts.length})
                </span>
                <span className="memo-echo-concept-panel-toggle">
                    {isExpanded ? '▼' : '▶'}
                </span>
            </div>

            {isExpanded && (
                <div className="memo-echo-concept-panel-content">
                    <div className="memo-echo-concept-note">
                        笔记: {noteTitle}
                    </div>

                    <div className="memo-echo-concept-list">
                        {extractedConcepts.map((concept) => (
                            <div
                                key={concept.name}
                                className="memo-echo-concept-item"
                            >
                                <label className="memo-echo-concept-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(concept.name)}
                                        onChange={() => handleToggle(concept.name)}
                                    />
                                    <span className="memo-echo-concept-name">
                                        [[{concept.name}]]
                                    </span>
                                    <span className="memo-echo-concept-meta">
                                        {Math.round(concept.confidence * 100)}% • {concept.matchInfo.matchType}
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
                        <button
                            onClick={handleCollapse}
                            className="memo-echo-concept-btn"
                        >
                            ▼ 折叠
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
