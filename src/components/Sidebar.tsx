/**
 * Sidebar - Search and related notes component
 * v0.7.0: Updated to use SearchService instead of VectorIndexManager
 */

import React, { useState, useEffect } from "react";
import type { SearchResult } from "@services/search-service";
import { SearchService } from "@services/search-service";

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
    onIndexCurrent?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    searchService,
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

    const handleIndexCurrent = async () => {
        if (isIndexing) return;

        if (onIndexCurrent) {
            setIsIndexing(true);
            try {
                await onIndexCurrent();
            } finally {
                setIsIndexing(false);
            }
        } else {
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
                    placeholder="搜索你的笔记..."
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
                        title="清除搜索"
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
