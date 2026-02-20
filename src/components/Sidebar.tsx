/**
 * Sidebar - Search and related notes component
 * v0.7.0: Updated to use SearchService instead of VectorIndexManager
 * Panel Combination Phase 3: Integrated ConceptSection
 */

import React, { useState, useEffect } from "react";
import type { SearchResult } from "@services/search-service";
import { SearchService } from "@services/search-service";
import {
	ConceptSection,
	ConceptGroup,
} from "./ConceptSection";
import type { ExtractedConceptWithMatch } from "@core/types/concept";

const DatabaseIcon: React.FC<{ size?: number; className?: string }> = ({
    size = 20,
    className,
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
    </svg>
);

interface SidebarProps {
    searchService: SearchService;
    initialMode?: "ambient" | "search";
}

export const Sidebar: React.FC<SidebarProps> = ({
    searchService,
    initialMode = "ambient",
}: SidebarProps) => {
    const [mode, setMode] = useState<"ambient" | "search">(
        initialMode as "ambient" | "search",
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [ambientResults, setAmbientResults] = useState<SearchResult[]>([]);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Concept states
    const [isConceptExpanded, setIsConceptExpanded] = useState(false);
    const [extractedConcepts, setExtractedConcepts] = useState<ConceptGroup[]>([]);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{
        totalFiles: number;
        processedFiles: number;
        totalConcepts: number;
        isProcessing: boolean;
    } | undefined>();

    // Deduplicate concepts by normalized name within a single file
    const deduplicateConcepts = (concepts: ExtractedConceptWithMatch[]): ExtractedConceptWithMatch[] => {
        const conceptMap = new Map<string, ExtractedConceptWithMatch>();

        for (const concept of concepts) {
            const normalizedName = concept.name.trim().toLowerCase();
            const existing = conceptMap.get(normalizedName);

            if (!existing) {
                conceptMap.set(normalizedName, concept);
            } else if (concept.confidence > existing.confidence) {
                const reasons = new Set<string>();
                if (existing.reason?.trim()) reasons.add(existing.reason.trim());
                if (concept.reason?.trim()) reasons.add(concept.reason.trim());
                conceptMap.set(normalizedName, {
                    ...concept,
                    reason: Array.from(reasons).join("; "),
                });
            } else {
                const reasons = new Set<string>();
                if (existing.reason?.trim()) reasons.add(existing.reason.trim());
                if (concept.reason?.trim()) reasons.add(concept.reason.trim());
                existing.reason = Array.from(reasons).join("; ");
            }
        }

        return Array.from(conceptMap.values());
    };

    useEffect(() => {
        const handleAmbientUpdate = (event: CustomEvent<SearchResult[]>) => {
            if (mode === "ambient") {
                setAmbientResults(event.detail);
            }
        };

        // Concept extraction event listener
        const handleConceptsExtracted = (event: CustomEvent) => {
            const { note, concepts } = event.detail;
            setExtractedConcepts([{
                notePath: note.path,
                noteTitle: note.title,
                concepts: deduplicateConcepts(concepts),
            }]);
            setIsConceptExpanded(true); // Auto-expand
        };

        // Batch increment event listener for real-time updates
        const handleBatchIncrement = (event: CustomEvent) => {
            const { batch, totalFiles, processedFiles, totalConcepts } = event.detail;
            setExtractedConcepts(batch.map((r: any) => ({
                notePath: r.note.path,
                noteTitle: r.note.title,
                concepts: deduplicateConcepts(r.concepts),
            })));

            setBatchProgress({
                totalFiles,
                processedFiles,
                totalConcepts,
                isProcessing: processedFiles < totalFiles,
            });

            setIsConceptExpanded(true); // Auto-expand
        };

        // Batch progress event listener
        const handleBatchProgress = (event: CustomEvent) => {
            const { isProcessing } = event.detail;
            setBatchProgress(prev => ({
                totalFiles: prev?.totalFiles || 0,
                processedFiles: prev?.processedFiles || 0,
                totalConcepts: prev?.totalConcepts || 0,
                isProcessing,
            }));
            setIsBatchProcessing(isProcessing || false);
        };

        // Batch stop event listener
        const handleBatchStop = (event: CustomEvent) => {
            setIsBatchProcessing(false);
        };

        window.addEventListener(
            "memo-echo:ambient-update",
            handleAmbientUpdate as EventListener,
        );
        window.addEventListener("memo-echo:concepts-extracted", handleConceptsExtracted as EventListener);
        window.addEventListener("memo-echo:batch-increment", handleBatchIncrement as EventListener);
        window.addEventListener("memo-echo:batch-progress", handleBatchProgress as EventListener);
        window.addEventListener("memo-echo:batch-stop", handleBatchStop as EventListener);

        return () => {
            window.removeEventListener(
                "memo-echo:ambient-update",
                handleAmbientUpdate as EventListener,
            );
            window.removeEventListener("memo-echo:concepts-extracted", handleConceptsExtracted as EventListener);
            window.removeEventListener("memo-echo:batch-increment", handleBatchIncrement as EventListener);
            window.removeEventListener("memo-echo:batch-progress", handleBatchProgress as EventListener);
            window.removeEventListener("memo-echo:batch-stop", handleBatchStop as EventListener);
        };
    }, [mode]);

    const handleSearch = async (query: string) => {
        if (!query.trim()) {
            setSearchQuery("");
            setMode("ambient");
            setSearchResults([]);
            return;
        }

        setMode("search");
        setIsLoading(true);
        try {
            const results = await searchService.search(query);
            setSearchResults(results);
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearchButtonClick = async () => {
        await handleSearch(searchQuery);
    };

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            await handleSearch(searchQuery);
        }
    };

    const handleClearSearch = () => {
        setSearchQuery("");
        setSearchResults([]);
        setMode("ambient");
    };

    const handleExtractCurrentFile = async () => {
        setIsBatchProcessing(true);
        try {
            window.dispatchEvent(new CustomEvent("memo-echo:concepts-extract-current"));
        } finally {
            setIsBatchProcessing(false);
        }
    };

    const handleBatchExtract = async () => {
        if (isBatchProcessing) {
            window.dispatchEvent(new CustomEvent("memo-echo:batch-stop-request"));
            return;
        }
        setIsBatchProcessing(true);
        try {
            window.dispatchEvent(new CustomEvent("memo-echo:batch-extract-all"));
        } finally {
            setIsBatchProcessing(false);
        }
    };

    const handleStopBatch = () => {
        window.dispatchEvent(new CustomEvent("memo-echo:batch-stop-request"));
    };

    const handleApplyConcepts = async (groups: ConceptGroup[]) => {
        window.dispatchEvent(
            new CustomEvent("memo-echo:batch-concepts-apply", {
                detail: { groups },
            }),
        );

        setExtractedConcepts([]);
    };

    const handleClearConcepts = () => {
        setExtractedConcepts([]);
    };

    const handleRejectConcept = (conceptName: string, notePath: string) => {
        setExtractedConcepts(extractedConcepts
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
            .filter((group) => group.concepts.length > 0));
    };

    const handleApplySingleConcept = async (group: ConceptGroup) => {
        window.dispatchEvent(
            new CustomEvent("memo-echo:single-concept-apply", {
                detail: { group },
            }),
        );

        setExtractedConcepts(extractedConcepts
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
            .filter((g) => g.concepts.length > 0));
    };

    return (
        <div className="memo-echo-sidebar">
            {/* Search box + button group */}
            <div className="memo-echo-search-box">
                <input
                    type="text"
                    placeholder="搜索你的笔记..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                {/* Extract current file button (NEW) */}
                <button
                    onClick={handleExtractCurrentFile}
                    className="memo-echo-icon-btn"
                    title="提取当前文件的概念"
                >
                    📄
                </button>
                {/* Batch extract button */}
                <button
                    onClick={handleBatchExtract}
                    className="memo-echo-icon-btn"
                    title={isBatchProcessing ? "停止批量提取" : "批量提取所有文件的概念"}
                >
                    {isBatchProcessing ? "🛑" : "📚"}
                </button>
                {/* Search button */}
                <button
                    onClick={handleSearchButtonClick}
                    className="memo-echo-search-btn"
                    disabled={isLoading}
                    title="搜索 (Enter)"
                >
                    <span style={{ fontSize: "14px", lineHeight: "1" }}>🔍</span>
                </button>
                {/* Clear search button */}
                {mode === "search" && (
                    <button
                        onClick={handleClearSearch}
                        className="memo-echo-clear-btn"
                        title="清除搜索"
                    >
                        <span style={{ fontSize: "14px", lineHeight: "1" }}>✕</span>
                    </button>
                )}
            </div>

            {/* Concept section - conditional rendering */}
            {(extractedConcepts.length > 0 || isBatchProcessing) && (
                <ConceptSection
                    isExpanded={isConceptExpanded}
                    onToggleExpand={() => setIsConceptExpanded(!isConceptExpanded)}
                    extractedConcepts={extractedConcepts}
                    batchProgress={batchProgress}
                    onApplyConcepts={handleApplyConcepts}
                    onClearConcepts={handleClearConcepts}
                    onRejectConcept={handleRejectConcept}
                    onApplySingleConcept={handleApplySingleConcept}
                    isBatchProcessing={isBatchProcessing}
                    onStopBatch={handleStopBatch}
                />
            )}

            {/* Search results */}
            <div className="memo-echo-results-container">
                {isLoading && (
                    <div className="memo-echo-loading">加载中...</div>
                )}

                {!isLoading && mode === "ambient" && (
                    <div className="memo-echo-ambient-view">
                        <h3>💭 相关笔记</h3>
                        <ResultList results={ambientResults} />
                    </div>
                )}

                {!isLoading && mode === "search" && (
                    <div className="memo-echo-search-view">
                        <h3>🔍 搜索结果</h3>
                        <ResultList results={searchResults} />
                    </div>
                )}
            </div>
        </div>
    );
};

const ResultList: React.FC<{ results: SearchResult[] }> = ({
    results,
}: {
    results: SearchResult[];
}) => {
    if (results.length === 0)
        return <div className="memo-echo-empty">暂无结果</div>;

    return (
        <div className="memo-echo-list">
            {results.map((result, index) => (
                <SmartCard key={`${result.notePath}-${index}`} result={result} />
            ))}
        </div>
    );
};

const SmartCard: React.FC<{ result: SearchResult }> = ({
    result,
}: {
    result: SearchResult;
}) => {
    const [showPreview, setShowPreview] = useState(false);

    // Extract file name from path
    const filePath = result.notePath.split("/").pop() || result.notePath;
    const excerpt = result.excerpt || "无预览";

    return (
        <div
            className="memo-echo-item"
            onMouseEnter={() => setShowPreview(true)}
            onMouseLeave={() => setShowPreview(false)}
            onClick={() => {
                // Trigger file open logic
                window.dispatchEvent(
                    new CustomEvent("memo-echo:open-file", { detail: result }),
                );
            }}
        >
            <div className="memo-echo-item-top">
                <span className="memo-echo-score-badge">
                    {Math.round(result.similarity * 100)}
                </span>
                <span className="memo-echo-file-link">{filePath}</span>
            </div>
            <div className="memo-echo-item-text">{excerpt}</div>

            {/* Smart Peek / Tooltip */}
            {showPreview && (
                <div className="memo-echo-smart-peek">
                    <div className="memo-echo-peek-header">
                        <span className="memo-echo-peek-concept">
                            {result.title}
                        </span>
                    </div>
                    <div className="memo-echo-peek-content">
                        {excerpt}
                    </div>
                </div>
            )}
        </div>
    );
};
