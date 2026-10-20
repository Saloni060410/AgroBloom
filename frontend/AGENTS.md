# AGENTS.md — frontend

Read the root `AGENTS.md` first for the whole-project picture. This file is frontend-only
conventions. Owner: **Darsh**.

## Stack

- Vite + React, plain JavaScript (no TypeScript).
- 3D: `@react-three/fiber` (Three.js in React) + `@react-three/drei` (helpers: `OrbitControls`,
  `Html`, `useGLTF`, etc.). Keep `<Canvas>` scenes in `src/scenes/`; reusable 3D pieces
  (meshes, lights, the soil-health visualization) go in `src/components/three/`.
- Animation: GSAP via `@gsap/react`'s `useGSAP` hook — always clean up timelines in the hook's
  return/cleanup, never leave a raw `gsap.timeline()` running outside a component lifecycle.
- Styling: Tailwind CSS utility classes; avoid custom CSS files unless Tailwind genuinely can't
  express it.
- State: Zustand. One store per domain (`useUserStore`, `useFarmStore`,
  `useRecommendationStore`) in `src/store/` — don't reach into another page's local state.
- Icons: `lucide-react` only, for a consistent icon set.

## AgroBloom theme (branch `saloni/frontend`)

The UI is the illustrated AgroBloom design: cream paper, leaf green, terracotta, Poppins. Colours, radii and
shadows live only in `src/styles/tokens.css` and are exposed through `tailwind.config.js`; components use the
token classes (`bg-primary-600`, `text-ink-primary`, `rounded-lg`), never raw hex. The product name is one
constant in `src/components/brand/brand.js`. Illustrations are inline SVG in `src/components/illustrations/`
(no image requests). The old 3D diorama UI was removed; `three`, R3F, GSAP and framer-motion are no longer
imported and can be dropped from `package.json` in a follow-up.

Shells: `SidebarShell` (Overview, My Fields, Reports), `TopNavShell` (field pages, `frame="forest"` for the
recommendation and history screens), `PublicShell` (404/500). Every field link goes through `useActiveField`
so it always points at a real field id. All fields for the signed-in user come from `usePlotStore`.

## Folder map

```
src/
├── components/
│   ├── ui/        # generic building blocks (Button, Card, Input) — no page-specific logic
│   ├── layout/     # Navbar, Sidebar, Footer
│   ├── forms/      # SoilInputForm, CropSelector, FieldMapPicker
│   ├── three/      # 3D building blocks used inside a <Canvas>
│   └── charts/     # 2D trend charts (library is your choice, lazy-loaded)
├── scenes/          # full <Canvas> compositions (one per visualization)
├── animations/      # useGSAP wrapper hooks, shared timelines
├── pages/           # Landing, Dashboard, FieldProfile, SoilInput, Recommendation, Schedule, History, Auth/
├── store/           # Zustand stores
├── services/        # api.js — all backend calls live here, nowhere else
└── hooks/, utils/, styles/
```

## Conventions

- The soil fields are fixed by the problem statement (N, P, K, pH, organic carbon, moisture). Never add or rename them.
- The design is Darsh's decision. The fixed parts are the API calls, the states every screen handles, and the basics in `docs/prompt-packs/darsh.md` (accessibility, low-end Android performance, Devanagari fonts, real content, tokens).
- Set a field's location by browser location, place-name search (`GET /geocode`) or manual coordinates.
- The schedule page is print-friendly so users can save it as PDF from the browser.

- All backend calls go through `src/services/api.js` — components never call `fetch`/`axios`
  directly, so the base URL, auth header, and error handling live in one place.
- The backend's response shape for farms/fields/recommendations is defined in
  `docs/api-contract.md` — check it (and Josh) before assuming a field name.
- Keep 3D/animation-heavy components lazy-loaded (`React.lazy`) where reasonable — this app
  needs to stay usable on low-end devices per the PRD's NFR2.
- Component files: PascalCase (`SoilInputForm.jsx`); hooks: camelCase starting with `use`.

## Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build      # production build
```
