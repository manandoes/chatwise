# Design.md — Visual Design System

## 1. Overall Direction

Sleek, modern, **dark-themed** SaaS dashboard with a **green glow/shadow lighting** accent — think a premium AI/tech product feel (dark surfaces, soft neon-green highlights on key elements, generous whitespace, no clutter). Should feel trustworthy and premium, not "hacker terminal."

## 2. Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--background` | `#0A0F0D` | App background (near-black, slight green undertone) |
| `--surface` | `#121815` | Cards, panels, sidebar |
| `--surface-elevated` | `#1A211D` | Modals, dropdowns, hover states |
| `--border` | `#232B27` | Dividers, card borders |
| `--primary` (accent green) | `#22E27A` | Primary buttons, active nav item, key highlights |
| `--primary-hover` | `#3FFF94` | Hover state on primary elements |
| `--primary-glow` | `rgba(34, 226, 122, 0.35)` | Box-shadow glow behind primary buttons/cards |
| `--text-primary` | `#F2F5F3` | Headings, main body text |
| `--text-secondary` | `#9AA7A1` | Secondary/muted text, helper text |
| `--text-disabled` | `#5C6864` | Disabled states |
| `--success` | `#22E27A` | Reuses primary green — success states |
| `--warning` | `#F5B94D` | Warnings (e.g. "reconnecting") |
| `--error` | `#F0554C` | Errors, disconnected states |
| `--info` | `#4DA6F5` | Informational badges |

### Glow usage rule
The green glow is a **signature accent, used sparingly** — on the primary CTA button, the active/connected status indicator, key numbers on the Overview page, and hover states on interactive cards. It should never be applied to large surfaces or body text; overuse kills the premium feel.

Example CSS pattern:
```css
.btn-primary {
  background: var(--primary);
  color: #04140B;
  box-shadow: 0 0 24px var(--primary-glow);
}
.card-active {
  border: 1px solid var(--primary);
  box-shadow: 0 0 32px var(--primary-glow);
}
```

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| Headings | **Inter** (or "Geist" if available) — Semibold/Bold | Clean, modern geometric sans, good at large sizes |
| Body | **Inter** — Regular/Medium | Same family as headings for consistency, weight does the differentiating |
| Monospace (for things like tokens/IDs, if ever shown) | **JetBrains Mono** | Only for genuinely code-like/technical values, sparingly per Rules.md non-technical-friendliness rule |

**Type scale:**

| Style | Size | Weight | Use |
|---|---|---|---|
| Display | 40–48px | 700 | Landing page hero |
| H1 | 32px | 700 | Page titles |
| H2 | 24px | 600 | Section headers |
| H3 | 18px | 600 | Card titles |
| Body | 15px | 400 | Default text |
| Small | 13px | 400 | Helper text, captions |
| Label | 12px | 500, uppercase, letter-spacing 0.04em | Field labels, table headers |

## 4. Layout & Spacing

- Base spacing unit: **4px**, scale in multiples of 4 (4, 8, 12, 16, 24, 32, 48, 64)
- Dashboard: fixed left sidebar (240px) + top bar (64px) + scrollable content area, generous padding (24–32px) around content
- Cards: 12–16px border radius, `--surface` background, `--border` 1px border, padding 20–24px
- Max content width on marketing pages: ~1200px, centered

## 5. Components — Style Notes

- **Buttons**: pill or 8px-radius rectangle, primary = solid green with glow (see §2), secondary = outlined in `--border` with `--text-primary` text, ghost = text-only with hover background `--surface-elevated`
- **Status indicators**: small dot + label — green dot + "Connected", amber dot + "Reconnecting…", red dot + "Disconnected"
- **Inputs**: dark surface background, subtle border, green border + soft glow on focus (no harsh blue browser default)
- **Tables** (Leads, Conversations): zebra-free, row divider = `--border`, hover row = `--surface-elevated`
- **Charts** (Analytics): line/bar charts using the green primary as the main data color, muted grays for gridlines/secondary series, never more than 2–3 colors per chart
- **Onboarding wizard slides**: one question centered per screen, progress dots/bar at top, smooth slide transition between steps, large tappable option cards (not tiny checkboxes) for bot selection

## 6. Iconography

- Use a single consistent icon set throughout (e.g. Lucide icons) — outline style, 1.5–2px stroke, matches the clean modern feel
- Icons take `--text-secondary` color by default, switch to `--primary` (with subtle glow on hover/active) when representing an active/selected state

## 7. Imagery / Illustration Style (Landing Page)

- Abstract, dark-background graphics with green glow/gradient accents (e.g. glowing network/node graphics suggesting "AI agents," soft blurred green orbs as background accents) rather than stock photography of people
- Product screenshots shown in a dark-mode browser/phone mockup frame with a subtle green glow behind the frame

## 8. Accessibility Notes

- Maintain WCAG AA contrast: verify `--text-secondary` (#9AA7A1) against `--background`/`--surface` — passes for body text at these values, but always check when adjusting either
- Never use color (green/red status dots) as the *only* signal — always pair with a text label (already reflected in §5)
- Focus states must be visible (green glow ring) for keyboard navigation, not removed for aesthetics
