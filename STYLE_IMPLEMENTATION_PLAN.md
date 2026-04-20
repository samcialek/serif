# Brutalist Modern Style Implementation Plan

## Design Principles

### Core Aesthetic
- **Hard edges**: 0-4px border radius maximum
- **Bold borders**: 2-3px solid borders, primarily black
- **Color blocking**: Solid fills, no gradients
- **Typography-forward**: Bold weights, uppercase labels, tight tracking
- **High contrast**: Black/white primary, single accent per section
- **Thin rules**: Horizontal dividers create visual rhythm

### Color Strategy
```
Primary:      Black (#000000) - borders, text, primary buttons
Background:   White (#FFFFFF) - card backgrounds
Accent:       Emerald (#10B981) - selected states, CTAs
              Amber (#F59E0B) - Loads
              Violet (#8B5CF6) - Markers
              Rose (#F43F5E) - Alerts
Gray:         #6B7280 - secondary text only
```

### Typography Rules
```
Headings:     font-black, can be uppercase
Labels:       text-xs, uppercase, tracking-widest, font-bold
Metrics:      text-3xl+, font-black
Body:         text-sm/base, font-medium
```

### Spacing & Borders
```
Border radius: 0px (cards), 2px (buttons), 4px max (pills)
Border width:  2px default, 3px emphasis
Shadows:       None (remove all box-shadows)
Dividers:      2px black (major), 1px gray (minor)
```

---

## Implementation Phases

### Phase 1: Design Tokens & Global Styles
Files:
- `tailwind.config.js` - Add brutalist presets
- `src/index.css` - Global overrides, remove shadows

Changes:
- Override default border-radius to be smaller
- Add `.brutalist-card`, `.brutalist-button` utilities
- Remove/minimize all shadows
- Add color block utilities

### Phase 2: Core Components
Files:
- `src/components/common/Card.tsx`
- `src/components/common/Button.tsx`
- `src/components/common/Badge.tsx`
- `src/components/common/Toggle.tsx`
- `src/components/common/CertaintySlider.tsx`

Changes:
- Card: 2px black border, 0 radius, no shadow, optional color header
- Button: Hard edges, uppercase, bold borders, solid fills
- Badge: Square/2px radius, uppercase, bold
- Toggle: Hard edges, solid colors
- Slider: Hard-edge track and thumb

### Phase 3: Layout Components
Files:
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/PageLayout.tsx`
- `src/components/layout/AppShell.tsx`

Changes:
- Sidebar: Bold active states with color blocks, thin rule dividers
- PageLayout: Bolder headings, horizontal rules
- AppShell: Clean lines

### Phase 4: Feature Components
Files:
- `src/components/insights/InsightCard.tsx`
- `src/components/insights/CertaintyFilter.tsx`
- `src/components/charts/DoseResponseCurve.tsx`
- `src/components/charts/CertaintyIndicator.tsx`

Changes:
- InsightCard: Complete brutalist overhaul
  - Color block header with category
  - Bold metrics display
  - Hard-edge progress bars
  - 2px borders throughout
- Filters: Hard-edge pills, bold selected states
- Charts: Minimal, bold lines

### Phase 5: Views
Files:
- `src/views/InsightsView.tsx`
- `src/views/DataView.tsx`
- `src/views/CoachLandingView.tsx`
- `src/views/ClientsView.tsx`
- All other views

Changes:
- Apply consistent brutalist styling
- Add color block accents
- Typography hierarchy
- Remove any remaining gradients/shadows

---

## Component Specifications

### Card (Brutalist)
```tsx
// Default
<Card>
  border: 2px solid #000
  border-radius: 0
  box-shadow: none
  background: white
</Card>

// With color header
<Card accent="emerald">
  <div className="bg-emerald-500 px-5 py-3 border-b-2 border-black">
    <span className="text-white font-black uppercase tracking-wider">Header</span>
  </div>
  <div className="p-5">Content</div>
</Card>
```

### Button (Brutalist)
```tsx
// Primary
bg-black text-white border-2 border-black
hover:bg-emerald-500 hover:border-emerald-500
uppercase tracking-wider font-bold
border-radius: 0

// Secondary
bg-white text-black border-2 border-black
hover:bg-black hover:text-white
uppercase tracking-wider font-bold

// Ghost
bg-transparent text-black border-2 border-transparent
hover:border-black
```

### Badge (Brutalist)
```tsx
px-2 py-1
border-2 border-black (or accent color)
bg-{color}-500 text-white
text-xs font-black uppercase tracking-wider
border-radius: 0-2px
```

### Progress Bar (Brutalist)
```tsx
// Container
h-3 bg-gray-200 border-0
border-radius: 0

// Fill
bg-black (or accent)
border-radius: 0
```

### Insight Card (Brutalist)
```
┌─────────────────────────────────────────────────┐
│ ██████████████ SLEEP ████████████████████████  │ ← Color block header
├─────────────────────────────────────────────────┤ ← 2px border
│                                                 │
│  SLEEP DURATION → RECOVERY SCORE               │ ← Uppercase title
│                                                 │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ THRESHOLD θ  │  │  EFFECT β    │            │
│  │   7.2 hrs    │  │    +18%      │            │ ← Bold metrics
│  └──────────────┘  └──────────────┘            │
│                                                 │
│  ════════════════════════════════ 87%          │ ← Hard-edge bar
│  CERTAINTY                                      │
│                                                 │
│  ───────────────────────────────────────────── │ ← Thin rule
│                                                 │
│  ████████████████████░░░░░ 89% PERSONAL        │ ← Evidence bar
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │           VIEW FULL ANALYSIS      →     │   │ ← CTA button
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## File Change Summary

| File | Priority | Changes |
|------|----------|---------|
| `src/index.css` | P1 | Global overrides, shadow removal |
| `src/components/common/Card.tsx` | P1 | Brutalist variant |
| `src/components/common/Button.tsx` | P1 | Hard edges, uppercase |
| `src/components/common/Badge.tsx` | P1 | Square, bold |
| `src/components/layout/Sidebar.tsx` | P2 | Bold nav, color blocks |
| `src/components/layout/PageLayout.tsx` | P2 | Typography, rules |
| `src/components/insights/InsightCard.tsx` | P2 | Complete overhaul |
| `src/components/insights/CertaintyFilter.tsx` | P2 | Hard-edge filters |
| `src/views/InsightsView.tsx` | P3 | Apply styling |
| `src/views/DataView.tsx` | P3 | Apply styling |
| `src/views/CoachLandingView.tsx` | P3 | Apply styling |
| Other views | P4 | Consistency pass |

---

## Execution Order

1. Start with `index.css` for global foundation
2. Update `Card.tsx` - most used component
3. Update `Button.tsx` - second most used
4. Update `Badge.tsx` - quick win
5. Update `Sidebar.tsx` - high visibility
6. Update `InsightCard.tsx` - hero component
7. Update `InsightsView.tsx` - showcase the style
8. Continue through remaining components and views
