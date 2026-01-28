# UI/UX Updates - Visual Guide

## 🎨 Concept Card Evolution

### Layout Transformation

#### **Before (v0.5.0)**

```
┌─────────────────────────────────────────┐
│ 🔗 关联建议            🔄               │ Header
├─────────────────────────────────────────┤
│                                         │
│ SourceNote ↔ TargetNote         95%     │ Line 1: Notes + Score
│                                         │
├─────────────────────────────────────────┤
│ 共享概念: HUDI × Lakehouse ×            │ Line 2: Concepts
│                                         │
├─────────────────────────────────────────┤
│              [接受]  [忽略]              │ Line 3: Buttons
│                                         │
└─────────────────────────────────────────┘
```

**Issues:**

- 4 visual sections (too many)
- Buttons take up full row
- 95% format doesn't match code style
- Concept tags with × not obvious

---

#### **After (v0.6.0)**

```
┌──────────────────────────────────────┐
│ [0.95] SourceNote ↔ TargetNote      │ Compact header
├──────────────────────────────────────┤
│ `HUDI` `Lakehouse`      [✅] [✕]    │ Concepts + Actions
└──────────────────────────────────────┘
```

**Improvements:**

- 3 visual sections (cleaner)
- Concept badges use markdown code style (`` ` ``)
- Confidence as decimal (0.95) - matches code aesthetic
- Icons for actions (easier to scan)
- More compact (saves vertical space)

---

## 🎯 Concept Badge Interaction

### Hover States

#### **State 1: Default**

```
` HUDI ` ` 湖仓一体 ` ` Lakehouse `
```

- Markdown code background
- Monospace font
- Clean, minimal appearance

#### **State 2: Hover on Badge**

```
` HUDI × ` ` 湖仓一体 ` ` Lakehouse `
     ↑
     Delete button appears with fade-in
```

- × button becomes visible
- Color changes to red
- Cursor changes to pointer

#### **State 3: Click × Button**

```
[Confirmation in backend]
    ↓
Association updates
    ↓
` 湖仓一体 ` ` Lakehouse `  ← HUDI removed
```

#### **State 4: Last Concept Deleted**

```
No concepts left
    ↓
Entire card removed from list
    ↓
User sees next association or empty state
```

---

## 🎨 Color Coding System

### Confidence Score Display

#### **High Confidence (0.9+)**

```
┌─────────────────────────────────┐
│ [0.95] ✅ SourceNote ↔ Target   │  🟢 Green background
└─────────────────────────────────┘
```

- Green background
- Indicates strong association
- User should likely accept

#### **Medium Confidence (0.7-0.9)**

```
┌─────────────────────────────────┐
│ [0.78] 🟡 SourceNote ↔ Target   │  🟡 Yellow background
└─────────────────────────────────┘
```

- Yellow background
- Indicates reasonable association
- User might want to review

#### **Low Confidence (<0.7)**

```
┌─────────────────────────────────┐
│ [0.65] ⚫ SourceNote ↔ Target   │  ⚫ Gray background
└─────────────────────────────────┘
```

- Gray background
- Indicates weak association
- User might ignore

---

## 🖱️ Action Buttons

### Icon-based Actions

#### **Unified Design**

```
✅ Accept    ✕ Ignore
────────────────────
Green (RGB)  Red (Error)
Min 28×28px  Min 28×28px
Border      Border
Hover: Fill  Hover: Fill
```

#### **State Transitions**

```
Normal State:
├─ Color: Muted
├─ Border: Subtle
└─ Background: Transparent

Hover State:
├─ Color: Accent (green/red)
├─ Border: Accent
└─ Background: Semi-transparent fill

Disabled State:
├─ Opacity: 0.5
├─ Cursor: Not-allowed
└─ Events: Prevented
```

---

## 📐 Spacing & Layout

### Card Dimensions

#### **Width**

```
Full width of sidebar (typically 280-320px)
- Padding: 10px on all sides
- Content width: 260-300px
```

#### **Height**

```
Min: 60px (header + concepts line)
Max: Unlimited (scrollable)
Typical: 70-80px per card
```

#### **Gap**

```
Between cards: 8px
Within card sections: 8px
Between concept badges: 6px
Between action buttons: 4px
```

---

## 🎬 Animations

### Transitions

#### **Hover Effects**

```
Duration: 0.2s
Easing: Ease-in-out
Properties:
  - Border color
  - Background color
  - Text color
```

#### **Loading Spinner**

```
Animation: Spin
Duration: 1s
Iteration: Infinite
Easing: Linear
Element: ⏳ icon (rotates)
```

---

## 📱 Responsive Design

### Desktop (>700px)

```
┌──────────────────────────────────┐
│ [0.95] SourceNote ↔ TargetNote  │
├──────────────────────────────────┤
│ `HUDI` `Lakehouse`    [✅] [✕]  │
└──────────────────────────────────┘
```

- Full width layout
- Icons stay on same line
- Concepts wrap if needed

### Mobile (<700px)

```
┌──────────────────┐
│ [0.95]           │
│ SourceNote ↔     │
│ TargetNote       │
├──────────────────┤
│ `HUDI`           │
│ `Lakehouse`      │
│ [✅] [✕]        │
└──────────────────┘
```

- Vertical stack if needed
- Touch-friendly button size (28×28px minimum)
- Text wrapping enabled

---

## 🎨 CSS Variable Mapping

### Colors Used

```
--interactive-accent        Blue (primary action)
--interactive-accent-hover  Lighter blue (hover)
--color-green              Green (success/accept)
--color-yellow             Yellow (warning)
--color-orange             Orange (caution)
--color-red                Red (danger/ignore)
--text-error               Red text
--text-muted               Gray text
--text-normal              Default text
--text-on-accent           White/light text on colored background
```

### Backgrounds

```
--background-primary       Main workspace color
--background-secondary     Slightly darker
--background-modifier-border  Border/divider lines
--background-modifier-hover   Hover state background
--code-background          Monospace code blocks
```

---

## ✨ Feature Highlights

### 1. Markdown Code Style Badges

```typescript
// Renders as: ` HUDI `
<code>{concept}</code>
```

**Why:** Consistent with Obsidian markdown aesthetic

### 2. Decimal Confidence Formatting

```typescript
// Before: 95%
// After: 0.95

const confidence = association.confidence.toFixed(2);
// Result: "0.95"
```

**Why:** More precise, aligns with ML confidence conventions

### 3. Hover-to-Delete Interaction

```
Normal:  ` HUDI `
Hover:   ` HUDI ×`  ← Button appears
Click:   Deleted
```

**Why:** Discoverable, doesn't clutter normal state

### 4. Right-aligned Action Buttons

```
` Concepts... `     [✅] [✕]
                    ↑    ↑
                    └────┴─ Right-aligned
```

**Why:** Consistent scanning pattern (left to right, right for actions)

---

## 📊 Accessibility Features

### Keyboard Navigation

- ✅ Tab: Navigate between cards and buttons
- ✅ Enter: Trigger button actions
- ✅ Escape: Dismiss modals (future)

### Screen Readers

- ✅ Button titles: "Accept this association"
- ✅ Badge titles: "Delete HUDI"
- ✅ Badge semantic: `<code>` element for code style

### Color Independence

- ✅ Confidence shown as text (0.95) not just color
- ✅ Actions show icons + text
- ✅ No color-only meaning

### Touch Targets

- ✅ Minimum 28×28px for all buttons
- ✅ 4-8px spacing between targets
- ✅ Clear visual feedback on tap

---

## 🔍 Comparison Table

| Aspect            | v0.5.0          | v0.6.0       | Improvement          |
| ----------------- | --------------- | ------------ | -------------------- |
| Lines per card    | 4               | 2            | 50% height reduction |
| Concept delete    | Separate button | Hover ×      | More intuitive       |
| Confidence format | 95%             | 0.95         | More precise         |
| Color coding      | None            | 3 levels     | Better scanning      |
| Button layout     | Full-width      | Icon-aligned | Better spacing       |
| Markdown style    | None            | Code badges  | Visual consistency   |

---

## 🎯 Next Improvements (v0.7.0)

### Planned Enhancements

- [ ] Concept editing with inline input
- [ ] Bulk concept merging UI
- [ ] Concept management panel
- [ ] Drag-to-reorder concepts
- [ ] Concept history/undo

### User Requests (TBD)

- [ ] Dark mode refinement
- [ ] Keyboard shortcuts
- [ ] Concept preview on hover
- [ ] Association strength indicator

---

**Last Updated:** January 28, 2026  
**Version:** v0.6.0  
**Status:** Complete ✅
