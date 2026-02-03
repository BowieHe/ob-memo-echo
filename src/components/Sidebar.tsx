import React, { useState, useEffect } from "react";
import type { SearchResult } from "@services/vector-backend";
import { VectorIndexManager } from "@services/vector-index-manager";

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
    indexManager: VectorIndexManager;
    initialMode?: "ambient" | "search";
    onIndexCurrent?: () => void; // Direct callback for index button
}

export const Sidebar: React.FC<SidebarProps> = ({
    indexManager,
    initialMode = "ambient",
    onIndexCurrent,
}: SidebarProps) => {
    const [mode, setMode] = useState<"ambient" | "search">(
        initialMode as "ambient" | "search",
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [ambientResults, setAmbientResults] = useState<SearchResult[]>([]);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isIndexing, setIsIndexing] = useState(false);

    // Effect to listen for ambient updates (to be connected with RecommendationView)
    // For now, we'll expose a method or event listener if needed,
    // but typically RecommendationView will call a method on a ref, or we use a context/store.
    // Simpler approach: RecommendationView updates a localized store or triggers an event.
    // Let's rely on props or a custom event for now to keep it loosely coupled.

    useEffect(() => {
        const handleAmbientUpdate = (event: CustomEvent<SearchResult[]>) => {
            if (mode === "ambient") {
                setAmbientResults(event.detail);
            }
        };

        window.addEventListener(
            "memo-echo:ambient-update",
            handleAmbientUpdate as EventListener,
        );
        return () =>
            window.removeEventListener(
                "memo-echo:ambient-update",
                handleAmbientUpdate as EventListener,
            );
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
            const results = await indexManager.search(query);
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

    const handleIndexCurrent = async () => {
        console.log("Index button clicked, onIndexCurrent:", onIndexCurrent);
        console.log("typeof onIndexCurrent:", typeof onIndexCurrent);

        if (isIndexing) {
            console.log("Already indexing, ignoring click");
            return;
        }

        if (onIndexCurrent) {
            console.log("Calling onIndexCurrent...");
            setIsIndexing(true);
            try {
                await onIndexCurrent();
                console.log("onIndexCurrent completed");
            } finally {
                setIsIndexing(false);
            }
        } else {
            console.log("onIndexCurrent is falsy, falling back to event");
            // Fallback to event for backward compatibility
            setIsIndexing(true);
            try {
                window.dispatchEvent(
                    new CustomEvent("memo-echo:index-current-file"),
                );
            } finally {
                setIsIndexing(false);
            }
        }
    };

    return (
        <div className="memo-echo-sidebar">
            <div className="memo-echo-search-box">
                <input
                    type="text"
                    placeholder="Search your notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <button
                    onClick={handleSearchButtonClick}
                    className="memo-echo-search-btn"
                    disabled={isLoading}
                    title="搜索 (Enter)"
                >
                    <span style={{ fontSize: "14px", lineHeight: "1" }}>🔍</span>
                </button>
                {mode === "search" && (
                    <button
                        onClick={handleClearSearch}
                        className="memo-echo-clear-btn"
                        title="Clear Search"
                    >
                        <span style={{ fontSize: "14px", lineHeight: "1" }}>✕</span>
                    </button>
                )}
                <button
                    onClick={handleIndexCurrent}
                    className="memo-echo-index-primary-btn"
                    disabled={isIndexing}
                    title="向量化当前笔记 + 提取概念"
                >
                    {isIndexing ? (
                        <span className="memo-echo-index-btn-content">
                            <span className="memo-echo-spinner">⏳</span>
                            <span>索引中...</span>
                        </span>
                    ) : (
                        <span className="memo-echo-index-btn-content">
                            <DatabaseIcon
                                size={14}
                                className="memo-echo-index-icon"
                            />
                        </span>
                    )}
                </button>
            </div>

            <div className="memo-echo-results-container">
                {isLoading && (
                    <div className="memo-echo-loading">Loading...</div>
                )}

                {!isLoading && mode === "ambient" && (
                    <div className="memo-echo-ambient-view">
                        <h3>💭 Related Thoughts</h3>
                        <ResultList results={ambientResults} />
                    </div>
                )}

                {!isLoading && mode === "search" && (
                    <div className="memo-echo-search-view">
                        <h3>🔍 Search Results</h3>
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
        return <div className="memo-echo-empty">No results found</div>;

    return (
        <div className="memo-echo-list">
            {results.map((result) => (
                <SmartCard key={result.id} result={result} />
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

    // Extract Thinking Point or fallback to Summary or Content snippet
    // Clean up markdown headers if fallback is used
    let rawPoint =
        result.metadata.thinking_point ||
        result.metadata.summary ||
        result.metadata.content?.slice(0, 100) ||
        "";

    const thinkingPoint = rawPoint.replace(/^#+\s*/, "").trim();
    const concept =
        result.metadata.concepts?.[0] || result.metadata.tags?.[0] || "Note";
    const filePath = result.metadata.filePath?.split("/").pop() || "Unknown";

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
                    {Math.round(result.score * 100)}
                </span>
                <span className="memo-echo-file-link">{filePath}</span>
            </div>
            <div className="memo-echo-item-text">{thinkingPoint}</div>

            {/* Smart Peek / Tooltip */}
            {showPreview && (
                <div className="memo-echo-smart-peek">
                    <div className="memo-echo-peek-header">
                        <span className="memo-echo-peek-concept">
                            {concept}
                        </span>
                        {result.metadata.start_line && (
                            <span className="memo-echo-peek-lines">
                                L{result.metadata.start_line}-
                                {result.metadata.end_line}
                            </span>
                        )}
                    </div>
                    <div className="memo-echo-peek-content">
                        {result.metadata.content?.slice(0, 300) ||
                            "No content preview available."}
                        {result.metadata.content &&
                        result.metadata.content.length > 300
                            ? "..."
                            : ""}
                    </div>
                </div>
            )}
        </div>
    );
};
