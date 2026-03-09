# 13. Design System & Brand

> Last updated: 2026-03-09

Living reference for Claude agents building UI in Collective OS. All tokens, patterns, and conventions in one place.

---

## Color Tokens

All colors use the `cos-` prefix. Defined in `src/app/globals.css` under `@theme`.

### Brand Colors

| Token | Hex | Tailwind Class | Usage |
|-------|-----|----------------|-------|
| `cos-midnight` | `#3a302d` | `text-cos-midnight`, `bg-cos-midnight` | Primary text, dark backgrounds (sidebar) |
| `cos-midnight-light` | `#4a403d` | `bg-cos-midnight-light` | Lighter dark variant |
| `cos-electric` | `#1f86a1` | `text-cos-electric`, `bg-cos-electric` | CTAs, links, active states, focus rings |
| `cos-electric-hover` | `#176d85` | `bg-cos-electric-hover` | Button hover state |
| `cos-cloud` | `#f6f4ef` | `bg-cos-cloud` | Page background, light surfaces |
| `cos-cloud-dim` | `#edeae4` | `bg-cos-cloud-dim` | Hover state for secondary/outline buttons |
| `cos-signal` | `#60b9bf` | `text-cos-signal`, `bg-cos-signal` | Success, positive indicators, strong quality |
| `cos-signal-dim` | `#4a9da3` | `bg-cos-signal-dim` | Dimmed signal variant |
| `cos-ember` | `#e44627` | `text-cos-ember`, `bg-cos-ember` | Warnings, energy, warmth |
| `cos-ember-dim` | `#c93b20` | `bg-cos-ember-dim` | Dimmed ember variant |
| `cos-warm` | `#f3af3d` | `text-cos-warm`, `bg-cos-warm` | Caution indicators, amber accents |
| `cos-warm-dim` | `#d99a2f` | `bg-cos-warm-dim` | Dimmed warm variant |
| `cos-slate` | `#9b9590` | `text-cos-slate` | Secondary text, descriptions |
| `cos-slate-light` | `#b5aea9` | `text-cos-slate-light` | Tertiary text, placeholders |
| `cos-slate-dim` | `#6b6560` | `text-cos-slate-dim` | Stronger secondary text |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `cos-danger` | `#e44627` | Error states, destructive actions (same as ember) |
| `cos-danger-dim` | `#c93b20` | Destructive button hover |

### Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `cos-surface` | `#ffffff` | Card backgrounds, form inputs |
| `cos-surface-raised` | `#faf8f5` | Slightly elevated surfaces, empty states |
| `cos-surface-overlay` | `rgba(58, 48, 45, 0.6)` | Modal/overlay backdrop |

### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `cos-border` | `#e5e0da` | Default borders, dividers |
| `cos-border-strong` | `#d1cbc4` | Emphasized borders, scrollbar thumb |

---

## Typography

Defined in `globals.css` under `@theme` and loaded via `next/font/google` in `src/app/layout.tsx`.

| Role | Font Family | CSS Variable | Tailwind Class | Weights Loaded |
|------|-------------|-------------|----------------|----------------|
| **Headings** | DM Sans | `--font-heading` | `font-heading` | 500, 600, 700, 900 |
| **Body** | Inter | `--font-sans` | `font-sans` (default) | Full variable font |
| **Code/Data** | Fragment Mono | `--font-mono` | `font-mono` | (not yet loaded via next/font) |

### Font Loading

Fonts are initialized in `layout.tsx` with `display: "swap"` and applied via CSS variables:

```tsx
<html lang="en" className={`${inter.variable} ${dmSans.variable}`}>
```

### Typography Patterns (from codebase)

- **Page headings:** `font-heading text-4xl font-bold leading-tight tracking-tight text-cos-midnight md:text-5xl`
- **Section headings:** `font-heading text-2xl font-bold text-cos-midnight md:text-3xl`
- **Card titles:** `font-heading text-sm font-semibold text-cos-midnight`
- **Body text:** `text-sm text-cos-slate` or `text-xs leading-relaxed text-cos-slate`
- **Labels/captions:** `text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim`
- **Nav brand text:** `font-heading text-lg font-bold text-cos-midnight`

---

## Border Radius Tokens

Warm, rounded aesthetic. All use the `cos-` prefix.

| Token | Value | Tailwind Class | Usage |
|-------|-------|----------------|-------|
| `cos-sm` | `0.5rem` (8px) | `rounded-cos-sm` | Small elements, footer logo |
| `cos-md` | `0.75rem` (12px) | `rounded-cos-md` | Medium elements, pagination buttons, compact cards |
| `cos-lg` | `1rem` (16px) | `rounded-cos-lg` | Nav items, form inputs, standard cards, ghost buttons |
| `cos-xl` | `1.25rem` (20px) | `rounded-cos-xl` | Feature cards, bordered containers, profile cards |
| `cos-2xl` | `1.5rem` (24px) | `rounded-cos-2xl` | CTA sections, large cards, logo containers |
| `cos-pill` | `3.6875rem` (59px) | `rounded-cos-pill` | Buttons, badges, pills, tags |
| `cos-full` | `9999px` | `rounded-cos-full` | Icon buttons (circular) |

### Default radius by element type:

- **Buttons:** `rounded-cos-pill` (default, outline, destructive, secondary) or `rounded-cos-lg` (ghost)
- **Icon buttons:** `rounded-cos-full`
- **Cards:** `rounded-cos-xl` (standard) or `rounded-cos-lg` (compact)
- **Form inputs:** `rounded-cos-lg`
- **Tags/pills/badges:** `rounded-cos-pill`
- **Search inputs:** `rounded-cos-xl`
- **Nav items:** `rounded-cos-lg`

---

## Spacing & Layout Conventions

No custom spacing tokens. Standard Tailwind spacing scale is used throughout.

### Common patterns:

- **Page max-width:** `max-w-5xl` with `px-6 md:px-12`
- **Section vertical padding:** `py-16` to `py-20`
- **Card padding:** `p-3` (compact), `p-4` (standard), `p-6` (feature cards), `p-8 md:p-12` (CTA)
- **Grid gaps:** `gap-4` to `gap-5`
- **Stack spacing:** `space-y-1` (tight lists), `space-y-3` (form fields), `space-y-6` (sections)
- **Sidebar width:** `w-56` (expanded), `w-16` (collapsed)
- **Nav item padding:** `px-3 py-2.5`
- **Pill/badge padding:** `px-2 py-0.5` or `px-2.5 py-0.5`

### Grid patterns:

- **3-column features:** `grid gap-5 md:grid-cols-3`
- **4-column grid:** `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`
- **2-column layout:** `grid gap-4 sm:grid-cols-2`

---

## shadcn/ui Components

Only one shadcn component is installed:

| Component | Path | Notes |
|-----------|------|-------|
| **Button** | `src/components/ui/button.tsx` | CVA-based, cos-branded variants |

### Button Variants

```tsx
import { Button } from "@/components/ui/button";

<Button variant="default">        // bg-cos-electric, rounded-cos-pill
<Button variant="destructive">    // bg-cos-danger, rounded-cos-pill
<Button variant="outline">        // bordered, bg-cos-surface, rounded-cos-pill
<Button variant="secondary">      // bg-cos-cloud-dim, rounded-cos-pill
<Button variant="ghost">          // transparent, hover:bg-cos-cloud-dim, rounded-cos-lg
<Button variant="link">           // text-cos-electric, underline on hover

<Button size="default">  // h-10 px-5 py-2
<Button size="sm">        // h-9 px-4
<Button size="lg">        // h-11 px-8
<Button size="icon">      // h-10 w-10 rounded-cos-full
```

### Dependencies for adding more shadcn components:

- `@radix-ui/react-slot` (installed)
- `class-variance-authority` (installed)
- `clsx` + `tailwind-merge` via `cn()` utility (installed)
- `lucide-react` for icons (installed)

---

## Utility Function

```tsx
// src/lib/utils.ts
import { cn } from "@/lib/utils";

// Merges Tailwind classes with conflict resolution
cn("bg-cos-electric", className, isActive && "bg-cos-signal")
```

---

## Icon System

**Library:** `lucide-react` (v0.577.0)

### Conventions:

- Standard size: `h-5 w-5` (nav), `h-4 w-4` (inline/buttons), `h-3.5 w-3.5` (compact)
- Always use `shrink-0` when inside flex containers
- Import individual icons: `import { Search, Loader2 } from "lucide-react"`

---

## Brand Voice & Personality (Ossy)

**Name:** Ossy | **Role:** AI growth consultant | **Email:** ossy@joincollectiveos.com

### Personality traits:

- **Knowledgeable but not arrogant** -- speaks from data, not opinion
- **Warm but professional** -- approachable without being casual
- **Proactive but not pushy** -- suggests, doesn't demand
- **Concise but thorough** -- respects the user's time while being complete
- **Adaptive** -- adjusts tone based on audience (CEO vs. marketing manager vs. freelancer)

### Voice principles:

1. Speak like a trusted advisor, not a salesperson. No hype, no buzzwords.
2. Lead with insight. Every interaction should teach the user something.
3. Respect intelligence. These are business leaders -- don't over-explain.
4. Be specific. "We found 3 firms with Shopify Plus experience in APAC" not "We found some great matches!"
5. Acknowledge uncertainty. "Based on their case studies, they appear strong in..." not "They're the best at..."

### What Collective OS is NOT:

- Not a marketplace (no bidding)
- Not a directory (no endless scrolling)
- Not a CRM (integrates with them)
- Not a freelancer platform (firms are the primary unit)
- Not LinkedIn (deeper, more actionable)

---

## Component Patterns & Conventions

### File organization:

```
src/components/
  ui/                    # shadcn/ui primitives (Button only so far)
  nav-bar.tsx            # Sidebar navigation
  chat-panel.tsx         # Main chat interface
  landing-page.tsx       # Public landing page
  login-panel.tsx        # Auth form (sign in/up + Google OAuth)
  upgrade-prompt.tsx     # Plan upgrade CTA
  voice-button.tsx       # Voice I/O with Deepgram
  chat/                  # Chat sub-components (result cards, tool renderers)
  admin/                 # Admin dashboard tabs
  experts/               # Expert/specialist profile components
```

### Component conventions:

1. **"use client"** directive at top of all interactive components
2. **TypeScript interfaces** for all props -- defined in the same file or in a shared `types.ts`
3. **`cn()` utility** for conditional class merging
4. **Inline Tailwind** exclusively -- no CSS modules, no styled-components
5. **forwardRef** used for shadcn primitives (Button), not for app-level components
6. **Default exports** for admin tab components; **named exports** for everything else

### Card pattern:

```tsx
<div className="rounded-cos-xl border border-cos-border bg-white p-6 shadow-sm">
  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-electric/10 text-cos-electric">
    {icon}
  </div>
  <h3 className="font-heading text-sm font-semibold text-cos-midnight">{title}</h3>
  <p className="mt-1.5 text-xs leading-relaxed text-cos-slate">{description}</p>
</div>
```

### Pill/tag pattern:

```tsx
// Default pill
<span className="rounded-cos-pill bg-cos-surface-raised px-2 py-0.5 text-[10px] font-medium text-cos-slate">
  {label}
</span>

// Accent pill
<span className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
  {label}
</span>
```

### Score badge pattern (color by threshold):

```tsx
const color =
  score >= 80 ? "bg-cos-signal/15 text-cos-signal"
  : score >= 60 ? "bg-cos-electric/15 text-cos-electric"
  : "bg-cos-warm/15 text-cos-warm";
```

### Form input pattern:

```tsx
<input
  className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
/>
```

### Tab/sub-nav pattern:

```tsx
<button
  className={`rounded-cos-lg px-4 py-2 text-sm font-medium transition-all ${
    isActive
      ? "bg-cos-electric text-white shadow-sm"
      : "bg-cos-surface text-cos-slate border border-cos-border hover:border-cos-electric/30 hover:text-cos-electric"
  }`}
>
```

### Loading state:

```tsx
<Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
```

### Error/status alerts:

```tsx
// Error
<div className="rounded-cos-lg bg-cos-danger/10 p-3 text-sm text-cos-danger">{error}</div>

// Info/status
<div className="rounded-cos-lg bg-cos-electric/10 p-3 text-sm text-cos-electric">{status}</div>
```

### Empty state:

```tsx
<div className="rounded-cos-lg border border-cos-border/30 bg-cos-surface-raised/50 px-3 py-2">
  <p className="text-xs text-cos-slate">No results found.</p>
</div>
```

### Hover interaction pattern:

```tsx
// Cards: border color change on hover
"hover:border-cos-electric/30"

// Nav items (dark bg): background lightening
"hover:bg-white/10 hover:text-white"

// List rows: subtle tint
"hover:bg-cos-electric/5 transition-colors"
```

---

## Dark Mode

**Not implemented.** The app uses a single light theme with `cos-cloud` (#f6f4ef) as the page background. The sidebar (`NavBar`) uses `bg-cos-midnight` with white/opacity text, but this is not a dark mode -- it is a persistent dark sidebar pattern.

---

## Animations

Defined in `globals.css`:

| Class | Effect | Duration |
|-------|--------|----------|
| `animate-slide-up` | Fade in + slide up 24px | 0.4s ease-out |
| `animate-spin` | Standard rotation (Tailwind built-in) | Used with `Loader2` |
| `animate-pulse` | Pulsing opacity (Tailwind built-in) | Used with mic recording |

---

## Focus & Accessibility

- Global `*:focus-visible` applies `outline: 2px solid cos-electric` with `outline-offset: 2px`
- Button component includes `focus-visible:ring-2 focus-visible:ring-cos-electric focus-visible:ring-offset-2`
- `antialiased` class on `<body>` for font smoothing
- Smooth scrolling enabled via `scroll-behavior: smooth` on `<html>`

---

## How to Add New Components

### Adding a new shadcn/ui component:

The project does **not** have `components.json` (shadcn CLI config). Add components manually:

1. Create the file in `src/components/ui/`
2. Use the cos- design tokens instead of shadcn defaults
3. Replace shadcn's default radius with `rounded-cos-*` tokens
4. Replace shadcn's default colors with cos- palette
5. Use `cn()` from `@/lib/utils` for class merging
6. Import `cva` from `class-variance-authority` for variant management

### Adding a new app component:

1. Create in `src/components/` (or a subdirectory for feature groups)
2. Add `"use client"` if the component uses hooks, state, or event handlers
3. Define TypeScript interface for props
4. Use `cn()` for conditional classes
5. Follow the cos- token palette -- never use raw hex values or Tailwind default colors
6. Use `lucide-react` for icons
7. Use named exports (not default) unless it is an admin tab

### Tailwind configuration:

The project uses **Tailwind CSS v4** with the new `@theme` directive in `globals.css`. There is no `tailwind.config.ts` file -- all design tokens are declared inline in `globals.css` via `@theme { }`. PostCSS is handled by `@tailwindcss/postcss`.

### Key files to reference:

- **Design tokens:** `src/app/globals.css`
- **Font loading:** `src/app/layout.tsx`
- **Button component:** `src/components/ui/button.tsx`
- **Utility (cn):** `src/lib/utils.ts`
- **Brand guidelines:** `docs/BRAND.md`
