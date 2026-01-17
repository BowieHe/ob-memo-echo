# Obsidian Memo Echo - PRD v0.3.0

## Version Information

-   **Version**: 0.3.0
-   **Codename**: "Insightful Synthesis" (洞见/共鸣)
-   **Status**: Draft
-   **Previous Version**: v0.2.0 (Intelligent Connection)

---

## 1. Core Philosophy: From Information to Insight

While v0.2.0 focused on finding _related text_, v0.3.0 focuses on finding _related concepts_.
The system aims to connect a note about "Kafka Idempotency" with a note about "HTTP API Design" through the shared abstract concept of **"Idempotency"**, even if they share no keywords.

**Key Value Proposition**:

1.  **Ambient Intelligence**: The sidebar quietly offers context without nagging.
2.  **Concept Discovery**: Connects ideas across domains (e.g., Distributed Systems <-> Daily Life).
3.  **Non-Intrusive**: No modification to user files. All magic happens in the sidebar and database.

---

## 2. Feature Specifications

### 2.1 Abstract Concept Extraction (The "Thinking Point")

**Problem**: Keyword search misses semantic connections (e.g., "Kafka" vs "HTTP").
**Solution**: Use LLM to extract "Design Patterns" and "Core Principles".

**Data Structure Update**:

```typescript
interface ChunkMetadata {
    // ... existing fields (chunk_id, content, etc.)
    summary: string; // Detailed summary
    tags: string[]; // Keyword Classifiers (e.g., "Kafka", "Rust")
    concepts: string[]; // NEW: Abstract Concepts (e.g., "Idempotency", "Trade-offs")
    thinking_point: string; // NEW: One-line aphorism/insight (e.g., "Reliability requires state tracking")
}
```

**Prompt Strategy**:

> "Analyze this paragraph. Identify 1-3 abstract computer science principles, engineering patterns, or philosophical concepts applied here. Ignore specific technology names in this extraction. Also provide a 5-10 word 'Thinking Point' (aphorism) that captures the essence."

---

### 2.2 Sidebar UX: The "Overlay" Model

The sidebar acts as the primary interaction surface. It has two distinct states.

#### State A: Ambient Mode (Default)

**Trigger**: User is typing, or has cleared the search box.
**Behavior**:

-   Passively monitors the active paragraph (debounced).
-   Performs a background vector search using the _current context_.
-   **Display**:
    -   Header: "💭 Related Thoughts" (Subtle).
    -   Content: List of Cards sorted by Semantic Relevance.
    -   _No search box focus required._

#### State B: Search Mode (Overlay)

**Trigger**: User focuses the input box and types.
**Behavior**:

-   **Input**: Standard search bar at the top (`[ Search your notes... ]`).
-   **Action**: Hides "Ambient" results. Shows "Search" results.
-   **Exit**: Clicking "Clear" (X) returns to Ambient Mode.

---

### 2.3 The "Smart Card" & Preview

**Visual Design**:
Compactness is key. We do not show the full text by default.

**Card Layout**:

```
┌──────────────────────────────────────────┐
│ [95%] • Concept: Idempotency             │ <--- Header (Match Score + Top Concept)
│ 📝 Kafka Consumption Guide.md            │ <--- Filename
│ "Message duplication is solved by..."    │ <--- Thinking Point / Short Excerpt
└──────────────────────────────────────────┘
```

**Interaction - "Smart Peek"**:

-   **Hover**: Shows a standard tooltip with the full `thinking_point`.
-   **Ctrl + Hover** (or Delay Hover): Triggers a **Custom React Portal** floating next to the card.
    -   Shows specific `StartLine` to `EndLine` content.
    -   Rendered lightly (no heavy Obsidian view load).
-   **Click**: Opens file -> Scrolls to Line -> Highlights Paragraph.

---

### 2.4 Storage & Architecture

**Constraint**: NO modification to user Markdown files.

-   **Vector DB (Qdrant)**: Stores all Metadata, Concepts, and Embeddings.
-   **Frontend**: React Sidebar queries Qdrant directly via Rust Core.
-   **Graph View**: [DE-SCOPED] - Future consideration.

---

## 3. User Stories

### Story 1: The Cross-Domain Link

> As a user reading about "Kafka" logic,
> I want to see my old note about "HTTP APIs",
> So that I can realize they both use "Idempotency" patterns.

### Story 2: The Unobtrusive Assistant

> As a user writing a diary entry,
> I want the sidebar to update silently,
> So I can glance at it for inspiration without stopping my typing flow.

### Story 3: The Quick Check

> As a user who remembers a vague term,
> I want to type in the search box to override the ambient suggestions,
> And then clear it to go back to writing.
