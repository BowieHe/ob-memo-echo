# Association View - CSS Styles Reference

## Overview

Comprehensive CSS styling for the Association Panel UI (v0.6.0), including association cards, concept badges, and action buttons.

---

## Color Scheme

### Confidence Levels

- **🟢 High Confidence (0.9-1.0)**: Green background
- **🟡 Medium Confidence (0.7-0.9)**: Yellow background
- **⚫ Low Confidence (<0.7)**: Gray background

---

## Component Styles

### 1. Panel Header

```css
.memo-echo-panel-header {
}
```

- Flexbox layout with space-between alignment
- Bottom border separator
- Contains title and refresh button

**Usage:** Top section of AssociationPanel

---

### 2. Association Card

```css
.memo-echo-association-card {
}
.memo-echo-association-card:hover {
}
.memo-echo-association-card.processing {
}
```

**Features:**

- Border and background with hover effects
- Accent border on hover
- Opacity reduced during processing
- 8px gap between internal elements

---

### 3. Note Pair Line

```css
.memo-echo-note-pair {
}
.memo-echo-confidence-badge {
}
.memo-echo-arrow {
}
.memo-echo-note-link {
}
```

**Layout:**

```
[0.95] SourceNote ↔ TargetNote
  ↑        ↑        ↑      ↑
  │        │        │      └─ note-link
  │        │        └──────── arrow
  │        └────────────────── note-link
  └───────────────────────────── confidence-badge
```

**Confidence Badge Colors:**

- High: Green (0.9+)
- Medium: Yellow (0.7-0.9)
- Low: Gray (<0.7)

---

### 4. Shared Concepts Line

```css
.memo-echo-shared-concepts {
}
.memo-echo-concepts-content {
}
```

**Layout:** Flex row with space-between

- Left: Concept badges (flex-wrap)
- Right: Action buttons (fixed width)

---

### 5. Concept Badge (Markdown Code Style)

```css
.memo-echo-concept-badge {
}
.memo-echo-concept-badge code {
}
```

**Features:**

- Markdown code background color
- Monospace font
- Inline-flex for proper alignment
- Hover effect for delete button visibility

**Example:**

```
` HUDI` ` 湖仓一体 ` ` Lakehouse ` ...
    ↑
    └─ Delete button appears on hover
```

---

### 6. Concept Delete Button

```css
.memo-echo-concept-delete-btn {
}
.memo-echo-concept-delete-btn:hover {
}
```

**Interaction:**

- Hidden by default (opacity: 0.7)
- Shows on parent hover (opacity: 1)
- Changes color to red on hover
- Smooth transition (0.2s)

---

### 7. Action Buttons (Right-aligned)

```css
.memo-echo-card-actions-right {
}
.memo-echo-action-btn {
}
.memo-echo-action-accept {
}
.memo-echo-action-ignore {
}
```

**Layout:**

- Flex row with 4px gap
- Fixed width (28px) for icon spacing
- Right-aligned in concepts line

**Icons:**

- ✅ Accept button (Green)
- ✕ Ignore button (Red)

**States:**

- Normal: Border, muted color
- Hover: Accent color, hover background
- Disabled: 0.5 opacity, not-allowed cursor

---

### 8. Bulk Actions

```css
.memo-echo-btn {
}
.memo-echo-btn-primary {
}
.memo-echo-btn-warning {
}
.memo-echo-btn-small {
}
.memo-echo-btn-success {
}
```

**Button Types:**

- Primary (blue): "Accept All"
- Warning (orange): "Clear Recent"
- Success (green): Used for action buttons

---

### 9. States

#### Loading

```css
.memo-echo-loading {
}
.memo-echo-spinner {
}
```

- Flex centered layout
- Spinning animation for spinner icon

#### Empty

```css
.memo-echo-empty {
}
.memo-echo-empty p {
}
.memo-echo-hint {
}
```

- Centered flex column
- Hint text in italic

---

### 10. Scrollbar Styling

```css
.memo-echo-association-list::-webkit-scrollbar {
}
.memo-echo-association-list::-webkit-scrollbar-thumb {
}
```

**Features:**

- 6px width
- Custom color on hover
- Border-radius for smoothness

---

## CSS Variables Used

### Colors

- `--interactive-accent`: Primary action color (blue)
- `--interactive-accent-hover`: Hover state for accent
- `--color-green`: Success/accept color
- `--color-yellow`: Warning/medium confidence
- `--color-orange`: Caution color
- `--color-red`: Danger/error color
- `--text-error`: Error text color
- `--text-on-accent`: Text on colored background
- `--text-muted`: Secondary text

### Backgrounds

- `--background-primary`: Main background
- `--background-secondary`: Secondary background
- `--background-modifier-border`: Border color
- `--background-modifier-hover`: Hover background
- `--code-background`: Code block background
- `--code-normal`: Code text color

### Typography

- `--font-monospace`: Monospace font for code
- All uses default font-size base (13-14px)

---

## Responsive Behavior

### Desktop (>700px)

- Full width layout
- Flex wrapping for concepts
- Fixed button widths

### Mobile (<700px)

- Concepts wrap to multiple lines if needed
- Action buttons remain fixed size
- Touch-friendly hit targets (min 28px)

---

## Animation

### Spin Animation

```css
@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}
```

- Used for loading spinner
- 1s duration, linear timing

### Transitions

- 0.2s for all interactive elements
- Smooth color changes
- Border color changes

---

## Accessibility Considerations

### Hit Targets

- Minimum 28px × 28px for all buttons
- Adequate spacing between clickable elements (4-8px)

### Color Contrast

- Confidence badges use CSS variables for contrast
- Text color automatically adjusts for readability

### Disabled States

- Visual feedback: opacity 0.5
- Cursor changes to not-allowed
- Prevented pointer events

---

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (webkit prefixed scrollbar)
- IE11: CSS Variables not supported (graceful degradation)

---

## Implementation Notes

### Concept Badge Icon Rendering

The concept badge uses markdown-style backticks (`` ` ``) rendered with HTML `<code>` tag:

```tsx
<code>{concept}</code>
```

### Confidence Badge Color Mapping

Colors are applied via attribute selectors matching the tooltip content:

```css
.memo-echo-confidence-badge[title*="0.9"] {
}
```

### Processing State

During concept deletion or acceptance:

```tsx
.memo-echo-association-card.processing {
    opacity: 0.6;
    pointer-events: none;
}
```

---

## Related Files

- [src/components/AssociationPanel.tsx](src/components/AssociationPanel.tsx) - React component
- [src/association-view.ts](src/association-view.ts) - View container
- [styles.css](styles.css) - All CSS definitions
