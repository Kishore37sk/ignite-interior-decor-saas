# Handoff: TeamHub — HR Team Management Admin Dashboard

## Overview
TeamHub is a web-based **HR / team-management admin dashboard**. It covers the day-to-day
workflows of an HR team: viewing company metrics, messaging, scheduling, managing employee
records, running payroll, approving leave, and tracking recruitment. The source is a Figma
UI kit ("TeamHub — HR Team Management Admin Dashboard UI Design (Preview)") that ships every
screen in three breakpoints — **Desktop, Tablet, Mobile**.

## About the design files
Everything in this bundle is a **design reference**, not production code:

- `reference_screens/*.png` — pixel-accurate renders of the finished screens, exported straight
  from Figma. **These are the source of truth for look & feel.**
- `components/**/*.jsx` — React components reconstructed from the editable Figma layers. They are
  **starting-point scaffolding**, not a finished component library. Treat their geometry/spacing
  values as accurate and their structure as a guide.

Your task is to **recreate these designs in the target codebase's own environment** (React, Vue,
Svelte, SwiftUI, etc.) using its established patterns, component library, and styling approach.
If no codebase exists yet, pick the most appropriate framework and implement there. Do **not**
ship the bundled JSX directly.

## Fidelity
**High-fidelity.** The reference PNGs are final visual design — colors, type, spacing, charts and
layout are settled. Recreate them faithfully. The caveat: the Figma file is a *preview* export, so
most screens exist only as flattened images. Measurements for those screens must be read off the
PNGs (and this doc), not from layer data. Four screens (below) have real layer structure.

## Screens / Views
There are **12 feature areas**, each designed at Desktop (2880px artboard), Tablet (1600px) and
Mobile (780px). Pixel values below are Figma artboard units — scale to your real viewport.

### Global shell (present on every desktop screen)
- **Left sidebar** — fixed, dark-on-light nav with the TeamHub logo at top, a vertical list of
  primary destinations (Dashboard, Inbox, Calendar, Employees, Attendance, Payroll, Leave,
  Recruitment, Performance), each an icon + label; active item uses the green accent.
- **Top bar** — page title on the left; search field, filter/sort controls, notifications, and the
  signed-in user's avatar + name on the right.
- **Content area** — white background, cards with soft shadows, a green primary-action button
  ("+ Add…") typically top-right of the content.

### 1. Dashboard
- **Purpose:** at-a-glance company health for HR.
- **Layout:** multi-column card grid — KPI stat cards across the top (headcount, attendance %,
  open roles, etc.), a donut/ring chart for a distribution, a heat-style attendance calendar block,
  bar charts, and a ranked list panel (top performers / upcoming) in a right rail.
- **Reference:** `reference_screens/01-dashboard-desktop.png`

### 2. Inbox
- **Purpose:** internal messaging / notifications.
- **Layout:** three-pane — conversation list (left), message thread (center), and a composer with a
  rich-text toolbar (bold, italic, underline, align, attach, emoji — see the Text* / Paperclip /
  SmileySticker icons). Right rail shows contact/context detail.
- **Reference:** `reference_screens/04-inbox-desktop.png`

### 3. Calendar
- **Purpose:** scheduling of events, time-off and shifts.
- **Layout:** month grid with color-coded event chips; a side panel listing the selected day's
  events and a create-event form.
- **Reference:** `reference_screens/07-calendar-desktop.png`

### 4. Employees — Table (EDITABLE LAYERS → `components/frames/EmployeesTableDesktop10.jsx`)
- **Purpose:** browse / manage the employee directory as a data table.
- **Layout:** full-width data table — avatar + name, role, department, status pill, contact, actions.
  Column headers with sort; filter/search in the top bar; pagination at the bottom. A grid-card
  variant of the same data also exists (tablet/mobile reference images only).

### 5. Employee Details (EDITABLE LAYERS → `components/frames/EmployeeDetailsMobile18.jsx`)
- **Purpose:** single employee profile.
- **Layout:** header with large avatar, name, role, and quick actions; tabbed/stacked sections for
  personal info, employment details, documents, and performance. Desktop + tablet exist as reference
  images (`reference_screens/16-employee-details-desktop.png`); the mobile layout is the editable frame.

### 6. Attendance (EDITABLE LAYERS → `components/frames/AttendanceDesktop22.jsx`)
- **Purpose:** track clock-in/out and attendance status.
- **Layout:** summary stat cards (present / late / absent / on-leave) over a per-employee attendance
  table or calendar heat-grid; filter controls by date range and department.

### 7. Payroll
- **Purpose:** salary runs and payroll summaries.
- **Layout:** top row of money stat cards (total payroll, net pay, deductions, bonuses), a trend line
  chart, and a payroll table per employee with status.
- **Reference:** `reference_screens/28-payroll-desktop.png`

### 8. Leave Management
- **Purpose:** review and approve time-off requests.
- **Layout:** request table (employee, leave type, dates, status) with approve/reject actions, leave
  balance summaries, and a donut of leave-type distribution.
- **Reference:** `reference_screens/31-leave-management-desktop.png`

### 9. Recruitment
- **Purpose:** hiring pipeline.
- **Layout:** pipeline/candidate list, stage columns or a candidate table, and role/opening summary cards.
- **Reference:** `reference_screens/34-recruitment-desktop.png`

### 10. Performance
- **Purpose:** performance tracking per employee. Mobile reference only in this export.

### 11. Register / Sign-up (EDITABLE LAYERS → `components/frames/RegisterDesktop37.jsx`)
- **Purpose:** account creation.
- **Layout:** split screen — form (name, email, password, confirm, terms checkbox, submit) on one
  side, branded illustration/photo on the other.
- **Note:** the large side image (6.3 MB) exceeded the export budget and was **not** extracted — supply
  your own brand image for that panel.

## Interactions & behavior
Derive exact behavior from the renders; the kit is static, so these are the intended behaviors to build:
- **Navigation:** sidebar items route to each feature area; active route highlighted in green.
- **Tables:** sortable column headers, row hover, row click → detail view, pagination, multi-select
  via the Checkbox component, bulk actions.
- **Filters/search:** top-bar search filters the current list; Funnel = filter, FadersHorizontal =
  sort/settings.
- **Inbox composer:** rich-text toolbar toggles (bold/italic/underline/align), attach, emoji, send.
- **Forms (Register, Create event, Add employee):** inline validation, required fields, disabled
  submit until valid, success/error states.
- **Charts:** hover tooltips on bars/donut/line segments.
- **Responsive:** sidebar collapses to a drawer/bottom-nav on tablet/mobile; multi-column grids
  reflow to single column; tables become stacked cards (see mobile reference exports).

## State management
Implement with the target app's conventions. Expected state:
- Current route / active nav item.
- Employee list + filters/sort/pagination/selection; selected employee for detail.
- Attendance records filtered by date range + department.
- Payroll run data; leave requests + approval status; recruitment pipeline stages.
- Inbox: conversation list, active thread, composer draft.
- Auth/session for the register/login flow.
- Data fetching: each feature area maps to a resource endpoint (employees, attendance, payroll,
  leave, recruitment, messages).

## Design tokens
The preview file defines **no formal variable/token system and no exported fonts** — the visual
styling is baked into the flattened PNGs. Reconstruct tokens by sampling the reference images.
Observed system:
- **Theme:** light. White surfaces (`#FFFFFF`), subtle grey app background, `rgb(228,228,228)`
  (`#E4E4E4`) used as a neutral fill/divider.
- **Accent:** green (primary buttons, active nav, positive status, chart highlights). Sample the
  exact hex from `01-dashboard-desktop.png` buttons.
- **Status colors:** green = positive/present/approved; amber/yellow = pending/late; red = negative/
  absent/rejected (visible on Attendance & Leave screens).
- **Radius / shadow:** cards use a small-to-medium radius with a soft, low-opacity drop shadow —
  match by eye from the renders.
- **Type:** no font was embedded; the renders use a clean geometric/neutral sans. Substitute the
  codebase's existing sans (or Inter/“General Sans”-style) and match sizes to the renders.
- **Font/size note:** because no layer-level type data survives the preview export, **do not** trust
  any single pixel size as authoritative — measure headings vs. body vs. caption relatively off
  the PNGs.

## Components (bundled, editable)
Under `components/`:
- **`icons/`** — 21-glyph icon set as data + a React wrapper. Render `<Icon name="IconFunnel" size={20} />`.
  Icons paint with `currentColor`. Valid names are in `icons/Icon.d.ts`:
  ArchiveTray, ArrowUUpLeft, ArrowUUpRight, CalendarBlank, CaretDown, CaretLeft, CaretRight,
  FadersHorizontal, Funnel, ListNumbers, MagnifyingGlass, Paperclip, SmileySticker, TextAa,
  TextAlignLeft, TextB, TextItalic, TextUnderline, Trash, Truck, X (each prefixed `Icon…`).
- **`Checkbox.jsx`** — checkbox with `state: "default" | "checked" | "filled"` and
  `size: "default" | "big" | "md"` (7 valid combinations in the source).
- **`frames/`** — the four editable screens as React components with their extracted bitmaps in
  `frames/assets/` (wired via `frames/fig-assets.css`): `EmployeesTableDesktop10`,
  `EmployeeDetailsMobile18`, `AttendanceDesktop22`, `RegisterDesktop37`. Keep `fig-assets.css`
  next to `frames/assets/`; `@import` it where you use these components.

## Assets
- `reference_screens/` — 7 desktop screen renders (Dashboard, Inbox, Calendar, Employee Details,
  Payroll, Leave Management, Recruitment). Tablet/mobile variants exist in the Figma source if needed.
- `components/frames/assets/` — bitmaps used by the four editable frames (avatars, screen imagery).
- **Missing:** the Register side image (6.3 MB) was over budget and not exported — provide your own.
- Avatar photos in the source are real bitmaps — reuse the extracted ones or swap in your own user data.

## Files in this bundle
```
design_handoff_teamhub/
├── README.md                         ← this file
├── reference_screens/                ← 7 high-fidelity desktop renders (source of truth)
└── components/
    ├── Checkbox.jsx / .d.ts          ← checkbox (3 states × 3 sizes)
    ├── icons/
    │   ├── icon-data.js              ← 21 icons as {viewBox, body}
    │   ├── Icon.jsx                  ← <Icon name=… size=… />
    │   └── Icon.d.ts                 ← valid icon names
    └── frames/
        ├── EmployeesTableDesktop10.jsx / .d.ts
        ├── EmployeeDetailsMobile18.jsx / .d.ts
        ├── AttendanceDesktop22.jsx / .d.ts
        ├── RegisterDesktop37.jsx / .d.ts
        ├── fig-assets.css           ← maps .fig-asset-* classes → assets/
        └── assets/                   ← extracted bitmaps
```

## Recommended build order
1. Build the **global shell** (sidebar + top bar) and routing.
2. Establish tokens (sample colors/radii/shadows from the renders) + the shared primitives
   (Button, Card, StatCard, Table, StatusPill, Checkbox, Icon, Avatar, Chart wrappers).
3. Implement feature areas, starting with the four that have editable layers (Employees table,
   Employee details, Attendance, Register), then the image-only screens.
4. Add tablet/mobile responsive behavior per the breakpoint renders.
