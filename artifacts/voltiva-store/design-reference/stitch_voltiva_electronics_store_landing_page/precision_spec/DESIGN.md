---
name: Precision Spec
colors:
  surface: '#f7f9fc'
  surface-dim: '#d8dadd'
  surface-bright: '#f7f9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f7'
  surface-container: '#eceef1'
  surface-container-high: '#e6e8eb'
  surface-container-highest: '#e0e3e6'
  on-surface: '#191c1e'
  on-surface-variant: '#3c494d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f4'
  outline: '#6c797e'
  outline-variant: '#bcc9cd'
  surface-tint: '#00687b'
  primary: '#00687b'
  on-primary: '#ffffff'
  primary-container: '#00b8d9'
  on-primary-container: '#004451'
  inverse-primary: '#48d7f9'
  secondary: '#535f76'
  on-secondary: '#ffffff'
  secondary-container: '#d4e0fb'
  on-secondary-container: '#57637a'
  tertiary: '#9a4600'
  on-tertiary: '#ffffff'
  tertiary-container: '#fe893c'
  on-tertiary-container: '#672c00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#afecff'
  primary-fixed-dim: '#48d7f9'
  on-primary-fixed: '#001f27'
  on-primary-fixed-variant: '#004e5d'
  secondary-fixed: '#d7e3fe'
  secondary-fixed-dim: '#bbc7e1'
  on-secondary-fixed: '#101c30'
  on-secondary-fixed-variant: '#3b475d'
  tertiary-fixed: '#ffdbc9'
  tertiary-fixed-dim: '#ffb68d'
  on-tertiary-fixed: '#321200'
  on-tertiary-fixed-variant: '#763300'
  background: '#f7f9fc'
  on-background: '#191c1e'
  surface-variant: '#e0e3e6'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system projects a precise, engineering-grade atmosphere balanced with clarity and approachability for makers, university engineering students, and professional hardware designers in Kuwait. 

### Design Philosophy
The system merges technical modernism with clean functional utility:
- **Structural Integrity:** Layouts evoke circuit boards and schematic logic through crisp structural grids, calibrated borders, and modular containers.
- **Engineered Restraint:** Visual flair is purposeful. Accent colors signify status, connectivity, or interaction rather than mere decoration.
- **Bilingual Equilibrium:** Latin and Arabic text hierarchies receive identical structural priority, optical weights, and rhythmic breathing room across interfaces.
- **Physicality via Micro-Details:** Subtle 1px circuit-trace accents, pin-out visual motifs, and restrained elevation reflect the tactile nature of hardware prototyping.

## Colors

The palette establishes an industrial yet high-tech canvas using deep maritime navy, radiant electric cyan, and clean off-white substrates.

### Palette Hierarchy & Application
- **Primary (`#00B8D9` - Electric Cyan):** Represents digital vitality, state transitions, active selections, and interactive primary affordances. Always pair with Deep Navy text to preserve WCAG AAA contrast ratios.
- **Secondary (`#101C30` - Deep Navy):** Represents structural authority. Deployed across navigation bars, primary headings, technical spec headers, dark-mode CTAs, and contextual footers.
- **Tertiary (`#FF8A3D` - Warm Orange):** Acts as an alert/accent channel. Reserved for critical spec highlights, stock scarcity, prototyping warnings, and clearance badges.
- **Neutral Surface (`#F7F9FC` - Soft White):** Canvas baseline across light layouts, preventing optical glare from raw white while highlighting component architecture.
- **Borders & Dividers (`#E5EAF0` - Cool Gray):** Used for 1px substrate outlines, data-grid splitters, and unselected component envelopes.
- **Text & Content Shades:**
  - High Emphasis: `#101C30`
  - Medium Emphasis / Engineering Specs: `#4A5568`
  - Low Emphasis / Footnotes / Pin Numbers: `#718096`

## Typography

The type system prioritizes technical legibility, dense parametric tables, and high clarity at small point sizes.

### Script Pairing Strategy
- **Latin:** Built on `Inter`, taking advantage of neutral letterforms, tabular figure options (`tnum`), and distinct punctuation necessary for part numbers, voltages, and pin configurations.
- **Arabic:** Paired natively with `IBM Plex Sans Arabic`. Weights map 1:1 with Inter (Regular, Medium, Semi-Bold, Bold). Font-size matching between scripts requires no scaling modifier due to complementary x-heights.
- **Tabular Figures:** Always apply `font-feature-settings: "tnum"` for pricing tables, pinouts, tolerance lists, and inventory counts to maintain strict vertical alignment.

## Layout & Spacing

Layouts use a structured 12-column grid system designed around standard hardware catalog modules and schematic documentation.

### Grid Specifications
- **Desktop (1200px+):** 12 columns, 1.5rem (24px) gutters, 2rem (32px) minimum outer canvas margins. Centered container max-width: 1320px.
- **Tablet (768px - 1199px):** 8 columns, 1.25rem (20px) gutters, 1.5rem (24px) margins.
- **Mobile (320px - 767px):** 4 columns, 1rem (16px) gutters, 1rem (16px) margins.

### Spacing Rhythm
- **Micro Rhythms (`space-xs` to `space-sm`):** Reserved for technical badge internal padding, metadata gaps, and icon-to-label distances.
- **Component Rhythms (`space-md` to `space-lg`):** Internal padding for component cards, dialog modules, and parametric specification groups.
- **Macro Rhythms (`space-xl` and above):** Section-to-section separation and catalog category shifts.

## Elevation & Depth

Visual depth avoids excessive atmospheric blur, favoring crisp surface tiers grounded by precision engineering lines.

### Tonal Hierarchy
1. **Base Layer (Ground):** `#F7F9FC` — Default canvas tone.
2. **Elevated Surface (Level 1):** `#FFFFFF` — Product cards, data rows, form sections. Defined primarily by a 1px solid `#E5EAF0` stroke and a resting shadow: `0 1px 3px rgba(16, 28, 48, 0.04), 0 1px 2px rgba(16, 28, 48, 0.02)`.
3. **Interactive Hover (Level 2):** `#FFFFFF` — Lifted cards, floating tooltips. Shadow elevates to `0 8px 24px -4px rgba(16, 28, 48, 0.08), 0 2px 6px -1px rgba(16, 28, 48, 0.04)`. Card border transitions to `rgba(0, 184, 217, 0.4)`.
4. **Overlay Planes (Level 3):** `#FFFFFF` or `#101C30` — Modals, dropdown menus, flyout carts. Shadow: `0 16px 36px -6px rgba(16, 28, 48, 0.16)`.

### The Trace Accent
Select header surfaces and hero cards carry an ultra-subtle background treatment: an SVG vector trace pattern rendered with 1px stroke in `#E5EAF0` (or `rgba(0, 184, 217, 0.08)` on dark surfaces), terminating in 3px circular solder-pad points.

## Shapes

The interface balances sharp industrial geometry with user-friendly ergonomics:
- **Base Cards & Modules:** 0.75rem (12px) to 1rem (16px) corner radius, reinforcing a modern casing feel.
- **Interactive Controls (Buttons, Inputs, Selects):** 0.5rem (8px) for snappy hand-tool tactility.
- **Badges, Status Chips, & Pin Indicators:** 0.25rem (4px) or full pill radius depending on whether the indicator displays a technical attribute (e.g., package type: square) or system status (e.g., in stock: pill).

## Components

### Buttons
- **Primary:** Background `#00B8D9`, text `#101C30` (`label-lg`, font weight 600). Height 44px (desktop) / 48px (mobile). Hover state darkens cyan to `#00A3C2`. Active state adds inset shadow `inset 0 2px 4px rgba(16, 28, 48, 0.2)`.
- **Secondary (Navy):** Background `#101C30`, text `#F7F9FC`. Used for high-priority technical documentation links, datasheets, and checkout submission.
- **Outline / Ghost:** 1px solid `#E5EAF0`, background transparent, text `#101C30`. Hover produces `#F7F9FC` background and `#00B8D9` border.

### Badges & Technical Chips
- **Status (In-Stock / Lead Time):** Pill radius. Background: 10% opacity tint of accent (e.g., `#FF8A3D1A`), text in full-tone accent (`#FF8A3D`), accompanied by a 6px solid dot indicator.
- **Spec Attribute Chips (SMD, DIP, Voltage):** 4px radius, background `#F7F9FC`, border 1px solid `#E5EAF0`, text `#4A5568`, monospace font styling applied to numerical units.

### Form Inputs & Selects
- 1px border in `#E5EAF0` over white fill. Default corner radius: 8px.
- Focus State: Border transitions to `#00B8D9` with an outer ring: `0 0 0 3px rgba(0, 184, 217, 0.2)`.
- Prefix/Suffix Containers: Cool Gray `#E5EAF0` container segment for technical units (e.g., `Ω`, `µF`, `V`, `MHz`).

### Cards (Product & Component Specs)
- Background `#FFFFFF`, 12px to 16px radius, bordered with 1px `#E5EAF0`.
- Includes structured regions: Top thumbnail with neutral pad, central spec metadata list with dotted tab leads, and bottom operational shelf housing part number, pricing, and rapid "Add to Rig" action.

### Interactive Spec Tables
- Condensed row heights (36px–40px), alternating subtle zebra striping (`#FFFFFF` to `#F7F9FC`), separated by 1px `#E5EAF0` horizontal borders.
- Hovered rows highlight with `#00B8D9` at 4% opacity with a solid 2px `#00B8D9` start border.