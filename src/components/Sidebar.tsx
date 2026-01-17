import React, { useState, useEffect } from "react";
import { SearchResult } from "../services/vector-store";
import { VectorIndexManager } from "../services/vector-index-manager";

interface SidebarProps {
    indexManager: VectorIndexManager;
    initialMode?: "ambient" | "search";
}

export const Sidebar: React.FC<SidebarProps> = ({
    indexManager,
    initialMode = "ambient",
}: SidebarProps) => {
    const [mode, setMode] = useState<"ambient" | "search">(
        initialMode as "ambient" | "search"
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [ambientResults, setAmbientResults] = useState<SearchResult[]>([]);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

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
            handleAmbientUpdate as EventListener
        );
        return () =>
            window.removeEventListener(
                "memo-echo:ambient-update",
                handleAmbientUpdate as EventListener
            );
    }, [mode]);

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setMode("ambient");
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

    const handleClearSearch = () => {
        setSearchQuery("");
        setSearchResults([]);
        setMode("ambient");
    };

    const handleIndexCurrent = () => {
        window.dispatchEvent(new CustomEvent("memo-echo:index-current-file"));
    };

    return (
        <div className="memo-echo-sidebar">
            <div className="memo-echo-search-box">
                <input
                    type="text"
                    placeholder="Search your notes..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                />
                {mode === "search" && (
                    <button
                        onClick={handleClearSearch}
                        className="memo-echo-clear-btn"
                        title="Clear Search"
                    >
                        ✕
                    </button>
                )}
                <button
                    onClick={handleIndexCurrent}
                    className="memo-echo-icon-btn"
                    title="Index Current File"
                >
                    📑
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
                    new CustomEvent("memo-echo:open-file", { detail: result })
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
