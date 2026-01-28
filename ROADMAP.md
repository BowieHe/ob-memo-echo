# Memo Echo - Product Roadmap

## Vision

打造一个隐喻 AI 助手，通过语义理解和概念关联，帮助用户在知识库中发现隐藏的联系。

---

## Release Timeline

### ✅ v0.6.0 - Association Foundation (Current)

**Status:** In Progress
**Release Date:** Q1 2026

#### Features Completed

- [x] Semantic search with RRF fusion (3 vector types)
- [x] Real-time recommendation engine
- [x] AI-powered concept extraction
- [x] Association discovery based on shared concepts
- [x] Note frontmatter injection (me_concepts, me_indexed_at)
- [x] Association preferences (ignore/delete management)
- [x] Batch operations (accept all, clear recent)

#### Current Sprint - Association UI Refinement

- [x] Merged SemanticSearch + Recommendation into unified "检索" panel
- [x] Markdown-style concept badges (`` `HUDI` ``)
- [x] Concept deletion with hover interaction
- [x] Auto-remove empty associations
- [x] Confidence score formatting (0.95 instead of 95%)
- [x] Icon-based actions (✅/✕) in right-aligned buttons
- [ ] Build & deploy UI updates

---

### 🔄 Phase 2 - Concept Management (v0.7.0)

**Estimated:** Q2 2026
**Priority:** Medium

#### 2.1 Concept Editing UI

**Description:** Allow users to rename/modify concepts in associations
**Why:** Users may want to correct AI extraction errors or consolidate similar concepts

**Implementation Details:**

- Add "Edit" mode to ConceptBadge component
- Convert code-formatted concept to editable input on click
- Validation: Check if new concept name already exists
- Sync mechanism: Update concept across:
    - Current association
    - Both related notes' frontmatter
    - Concept cache
- Cascade handling: If user edits "HUDI" → "Lakehouse", should this affect:
    - [ ] All associations containing HUDI?
    - [ ] Other notes' concepts?
    - [ ] Requires design discussion

**Complexity:** 🟠 Medium
**Dependencies:** None (can build incrementally)

#### 2.2 Concept Merging

**Description:** Merge duplicate/synonym concepts
**Why:** "Hudi", "HUDI", "Apache Hudi" should be treated as one concept

**Implementation Details:**

- Add "Merge" button in concept context menu
- Modal: Select source concept and target concept
- Update all references across:
    - All associations
    - All notes' frontmatter
    - Concept index
- Keep audit trail of merges

**Complexity:** 🟡 High (lots of cross-reference updates)
**Dependencies:** 2.1 (Concept Editing foundation)

#### 2.3 Concept Management Panel

**Description:** Standalone panel to view and manage all concepts in the vault
**Why:** Current concept management is scattered across individual associations

**Features:**

- List all concepts with frequency count
- Filter by confidence threshold
- Bulk operations: Delete, Merge, Consolidate
- Concept statistics: "Used in 5 associations, 12 notes"
- One-click consolidation: "HUDI" + "Apache Hudi" → "HUDI"

**Complexity:** 🟡 High (new UI component + bulk operations)
**Dependencies:** 2.1, 2.2

---

### 📊 Phase 3 - Analytics & Insights (v0.8.0)

**Estimated:** Q3 2026
**Priority:** Low

#### 3.1 Association Analytics Dashboard

**Features:**

- Total associations discovered vs accepted ratio
- Top concepts by frequency
- Most connected note pairs
- Association confidence distribution (histogram)

#### 3.2 Concept Graph Visualization

**Features:**

- Interactive network graph of connected notes
- Node size = number of associations
- Edge weight = confidence score
- Click to explore related clusters

---

### 🎯 Phase 4 - Advanced Features (v0.9.0+)

**Estimated:** Q4 2026+
**Priority:** Low

#### 4.1 AI-powered Concept Refinement

- Learn from user edits/deletes
- Improve extraction quality over time
- Custom concept dictionaries per vault

#### 4.2 Cross-vault Sync

- Sync associations between vaults
- Collaborative concept management

#### 4.3 Export & Integration

- Export association graph as JSON/CSV
- Obsidian Canvas support for associations
- External knowledge base integration

---

## Known Constraints & Trade-offs

### v0.7.0 Design Decisions

**Concept Editing Scope**

- Initially only affects "this association", not globally
- Rationale: Simpler, lower risk of unintended side effects
- Future: Global editing available as opt-in setting

**Cascade Behavior**

- When editing concept in one association:
    - ✅ Update both related notes' frontmatter
    - ❌ Do NOT auto-update other associations
    - Rationale: Explicit is better than implicit

**Concept Validation**

- New concept names must:
    - Not be empty
    - Not be already in this association
    - May exist in other associations (allowed)

---

## Feature Request Tracking

### From User Feedback (v0.6.0)

- [ ] More granular confidence thresholds for filtering
- [ ] Remember last viewed association (UX improvement)
- [ ] Keyboard shortcuts for accept/ignore (accessibility)
- [ ] Dark mode support for Association Panel

### Potential Future Requests

- [ ] Undo/Redo for deletions
- [ ] Concept versioning / audit log
- [ ] Multi-language concept support
- [ ] Wikilink preview in concept badge

---

## Development Guidelines for v0.7.0

### TDD Requirement

All Phase 2 features must follow strict TDD:

1. **Red**: Write failing tests first
2. **Green**: Implement minimal code to pass
3. **Refactor**: Optimize while tests stay green

### Testing Checklist for Concept Editing

- [ ] Test: Can't edit to empty string
- [ ] Test: Can edit to new valid concept
- [ ] Test: Frontmatter updates on both notes
- [ ] Test: Concept cache updates
- [ ] Test: UI re-renders correctly
- [ ] Test: Error handling for file conflicts
- [ ] Test: Duplicate concept name validation

### Code Review Checklist

- [ ] All feature tests passing
- [ ] Frontmatter sync verified
- [ ] Error messages are user-friendly
- [ ] No console.log in production code
- [ ] TypeScript strict mode compliance
- [ ] Obsidian API version compatibility

---

## Metrics & Success Criteria

### v0.6.0 Success

- ✅ >90% of discovered associations have confidence > 0.7
- ✅ Users can batch accept/ignore associations
- ✅ Concept injection doesn't corrupt frontmatter
- ✅ <1 second response time for concept deletion

### v0.7.0 Success Criteria (TBD)

- [ ] Concept editing resolves >50% of user corrections
- [ ] Merging reduces duplicate concepts by >80%
- [ ] Concept Management Panel is used in 60%+ of workflows
- [ ] Zero unintended side effects from edits

---

## Questions & Decisions Needed

### For v0.7.0 Planning

1. **Global vs Local Editing**
    - Q: When user edits "HUDI" in one association, should OTHER associations with "HUDI" auto-update?
    - Current decision: NO (local only)
    - Reconsider after user feedback

2. **Concept Merging Priority**
    - Q: Should 2.2 (Merging) be in v0.7.0 or deferred to v0.8.0?
    - Current decision: Defer to v0.8.0 (more complex)

3. **Audit Trail**
    - Q: Should we track who made what edits and when?
    - Current decision: NO (single-user plugin), reconsider for team vaults

---

## Related Documentation

- [AGENTS.md](../AGENTS.md) - Development guidelines
- [PRD/PRD-v0.6.0.md](../PRD/PRD-v0.6.0.md) - v0.6.0 feature specs
- [src/services/association-engine.ts](../src/services/association-engine.ts) - Core engine docs
