# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # runs API (:3001) + Vite (:5173) concurrently, with hot reload on the frontend
npm run dev:api     # API only (node server.js) — no hot reload, restart manually after backend edits
npm run dev:web     # Vite only
npm run build        # production build to dist/
npm run preview      # preview the production build
npm start             # node server.js (single-process, used by `vercel dev` / production-style run)
```

There is no test suite and no lint config in this repo (no `test`/`lint` script, no eslint/prettier config). Don't invent one unless asked.

The Vite dev server proxies `/api/*` to `http://localhost:3001` (see `vite.config.js`) — always hit the frontend through `:5173`, not `:3001` directly, so the proxy and cookies/headers behave like production.

## Architecture

### Local mock database instead of a live Supabase project
`api/index.js` does **not** talk to a real Supabase project for data. It imports `createLocalClient()` from `api/localDb.js`, a hand-rolled shim that implements the subset of the `supabase-js` query-builder chain this codebase actually uses (`.from().select().eq().in().order().single().maybeSingle().insert().update().delete().upsert()`). The object it returns is "thenable" (works with `await` and inside `Promise.all`), so route handlers are written exactly as if `supabase` were the real client — swapping backends means changing one line.

Data is persisted to `data/db.json` (gitignored), created and seeded on first run: one gestor account (`gestor@fourbase.com` / `gestor123`), 3 demo clients, and the 3 default Kanban columns. Delete that file to reset to a clean seed.

Known gap in the shim: it does **not** parse embedded-resource/join select syntax (`col:table!fk_name(...)`). The one route that needed a join (`GET /api/team/tasks`) resolves it manually — fetches tasks and users separately and merges them in JS. Follow that pattern rather than teaching the shim to parse joins.

To point the backend at a real Postgres/Supabase project again, change `const supabase = createLocalClient()` in `api/index.js` back to `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` from `@supabase/supabase-js`. The SQL schema for that path (tables, columns, RLS policies) is tracked in `supabase/migrations/*.sql` — the local shim doesn't enforce any of this, so keep those files in sync when you add a field to a table used by both paths. The local file-based DB does **not** work on Vercel (no persistent disk across serverless invocations) — a real deploy needs the Supabase client restored.

Frontend file uploads (`src/supabase.js`) are a separate concern and still go straight from the browser to real Supabase **Storage** buckets (`fourbase-media`, `fourbase-client-media`), bypassing the Express API entirely to avoid serverless payload limits. Data lives in the local mock; file blobs live in real Supabase Storage — don't conflate the two when debugging uploads vs. data persistence.

### Auth
Custom JWT auth (not Supabase Auth). `POST /api/auth/login|register` sign a JWT containing `{sub, name, role}`; the `auth` Express middleware in `api/index.js` only verifies the signature — it never re-checks that the user id still exists in the DB. Consequence worth knowing: a browser tab holding an old token will keep "succeeding" even after `data/db.json` is deleted/reseeded, silently writing rows under a `user_id`/`assigned_to` that no longer matches anyone. If data looks like it's "disappearing" for one browser tab but not others, suspect a stale token before suspecting the DB — log out and back in to get a token bound to the current seed.

Two roles: `funcionario` (only sees their own tasks/notes — `GET /api/tasks` filters `assigned_to = req.user.id` server-side) and `gestor` (single seeded account; gated routes via the `gestorOnly` middleware — member management, `/api/team/*`). Client-side, `gestorOnly`-flagged entries in the `VIEWS` array in `App.jsx` hide whole nav tabs (e.g. "Equipe") from non-gestor users; this is UI convenience only, the real enforcement is server-side.

### State: `App.jsx` as the hub, no router, no global store
There's no react-router and no Redux/Zustand/Context for domain data. `App.jsx` owns `tasks`, `notes`, `members`, `clients`, `columns` and fetches them once in `loadAll()`, then passes state + CRUD callbacks down as props to whichever view is active. "Navigation" is just a `view` string in `App.jsx` state, matched against the `VIEWS` array. Views that don't need to be globally shared (Documentações, Equipe, Clientes listing) fetch their own supplementary data directly via `src/api.js` instead of going through `App` state — check whether a view already receives what it needs as props before adding a new `useEffect` fetch.

### Client-scoped workspace pattern
Selecting a client in `ClientsView` sets `selectedClientId` in `App.jsx`, which swaps the `clientes` view to render `ClientWorkspace` instead of the client list — a Kanban + Documentos tabs UI scoped to that one client, via the `client_id` foreign key present on both `fourbase_tasks` and `fourbase_folders`. Any new client-scoped feature should hang off `ClientWorkspace` rather than introducing a new top-level view, since there's no router to add a real route to.

### Color system
`src/colors.js` exports `assigneeColor(id, overrideColor)` — deterministically hashes an id to a fixed palette color, unless a person/client has picked a custom hex `color` (set via the native `<input type="color">` spectrum picker in `ColorPickerField`, used by `TeamMemberModal`/`ClientModal`). `memberColor(id, list)` is the variant for call sites that only have a foreign key (e.g. `task.assigned_to`) and need to look up the color from a `members`/`clients` array already in scope. This color drives avatars, the Kanban card's left border, and calendar dots — it is deliberately unrelated to task priority, which uses a fixed grayscale scale instead (`.priority-tag.p-*` in `styles.css`).

### Kanban columns are data, not constants
Columns (`todo`/`doing`/`done` plus any custom ones) live in `fourbase_columns` (key/label/position/color), not hardcoded in the frontend. `App.jsx` has a `DEFAULT_COLUMNS` fallback + a per-user `localStorage` cache for the (now rare) case the table has no data yet.

### Icons
`src/icons.jsx` is a hand-rolled SVG icon set (no icon library dependency) built on a shared `Icon` wrapper. Add new icons following that same pattern rather than pulling in a library.

### Deploy
`vercel.json` rewrites `/api/*` to `api/index.js`'s default export, deployed as-is as a serverless function — see the local-mock-DB caveat above before assuming a Vercel preview behaves like local dev.
