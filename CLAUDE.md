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
npm test              # node:test — tests/*.test.js (API against a temp local DB, no network)
```

Tests use the built-in `node:test` runner, no extra framework. `tests/workspace-isolation.test.js` boots the Express app against a throwaway `FOURBASE_DB_PATH` fixture with two workspaces and asserts no cross-tenant reads/writes and correct gestor/funcionário gating — run it after touching any route's `workspace_id`/`user_id` filters. There is no lint config.

The Vite dev server proxies `/api/*` to `http://localhost:3001` (see `vite.config.js`) — always hit the frontend through `:5173`, not `:3001` directly, so the proxy and cookies/headers behave like production.

## Architecture

### API layout
`api/index.js` is only the entry point: builds the Express app (helmet, CORS, JSON, rate limit on credential routes) and mounts one router per domain from `api/_lib/routes/*.js` (auth & invitations, profile, tasks, members, notes, todos, media, folders, columns, tags, team, clients, reports). Routers register full `/api/...` paths and are mounted without a prefix. Shared pieces live in `api/_lib/`: `supabase.js` (DB client), `auth.js` (JWT, `auth`/`gestorOnly` middleware, `workspaceOf`, `authLimiter`), `http.js` (`asyncRoute`), `validation.js` (`inWorkspace`, `validMemberIds`, `normalizeColor`). The `_` prefix matters: Vercel turns every non-underscored file under `api/` into its own serverless function — keep new backend modules under `api/_lib/`.

### Data backend: real Supabase in production, local mock in dev
With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set (production on Vercel), the API (`api/_lib/supabase.js`) uses the real Supabase Postgres with the **service_role** key. All `fourbase_*`/`weflow_*` tables have RLS enabled with **no policies** (migration `20261002000000_lock_down_table_rls.sql`), so the anon key shipped in the browser bundle cannot touch them — the Express API is the only path to the data, and it enforces tenancy by filtering every query on `workspace_id` from the JWT. Never add a permissive table policy back, and never expose the service_role key to the frontend (`VITE_*`).

Without `SUPABASE_URL` (default local dev), `api/_lib/supabase.js` falls back to the local mock instead. It imports `createLocalClient()` from `api/localDb.js`, a hand-rolled shim that implements the subset of the `supabase-js` query-builder chain this codebase actually uses (`.from().select().eq().in().order().single().maybeSingle().insert().update().delete().upsert()`). The object it returns is "thenable" (works with `await` and inside `Promise.all`), so route handlers are written exactly as if `supabase` were the real client — swapping backends means changing one line.

Data is persisted to `data/db.json` (gitignored), created and seeded on first run: one gestor account (`gestor@fourbase.com` / `gestor123`), 3 demo clients, and the 3 default Kanban columns. Delete that file to reset to a clean seed.

Known gap in the shim: it does **not** parse embedded-resource/join select syntax (`col:table!fk_name(...)`). The one route that needed a join (`GET /api/team/tasks`) resolves it manually — fetches tasks and users separately and merges them in JS. Follow that pattern rather than teaching the shim to parse joins.

The mock file path can be overridden with `FOURBASE_DB_PATH` (used by the tests). The SQL schema for that path (tables, columns, RLS policies) is tracked in `supabase/migrations/*.sql` — the local shim doesn't enforce any of this, so keep those files in sync when you add a field to a table used by both paths. The local file-based DB does **not** work on Vercel (no persistent disk across serverless invocations) — a real deploy needs the Supabase client restored.

Frontend file uploads (`src/supabase.js`) are a separate concern and still go straight from the browser to real Supabase **Storage** buckets (`fourbase-media`, `fourbase-client-media`), bypassing the Express API entirely to avoid serverless payload limits. Data lives in the local mock; file blobs live in real Supabase Storage — don't conflate the two when debugging uploads vs. data persistence.

### Auth
Custom JWT auth (not Supabase Auth). `POST /api/auth/login|register` sign a JWT containing `{sub, name, role}`; the `auth` Express middleware in `api/_lib/auth.js` only verifies the signature — it never re-checks that the user id still exists in the DB. Consequence worth knowing: a browser tab holding an old token will keep "succeeding" even after `data/db.json` is deleted/reseeded, silently writing rows under a `user_id`/`assigned_to` that no longer matches anyone. If data looks like it's "disappearing" for one browser tab but not others, suspect a stale token before suspecting the DB — log out and back in to get a token bound to the current seed.

Two roles: `funcionario` (only sees their own tasks/notes — `GET /api/tasks` filters `assigned_to = req.user.id` server-side) and `gestor` (single seeded account; gated routes via the `gestorOnly` middleware — member management, `/api/team/*`). Client-side, `gestorOnly`-flagged entries in the `VIEWS` array in `App.jsx` hide whole nav tabs (e.g. "Equipe") from non-gestor users; this is UI convenience only, the real enforcement is server-side.

### Routing and state: URL-driven navigation, `App.jsx` as the data hub
Navigation uses react-router-dom (`BrowserRouter` in `src/main.jsx`). **Tasks live in TanStack Query** (`QueryClientProvider` in `main.jsx`, defaults in `src/queryClient.js`): see "Tasks" below. **Notes too** (see "Notes" below). The rest of the domain data has no store yet — `App.jsx` owns `members`, `clients`, `tags`, `columns` and fetches them once in `loadAll()`, then passes state + CRUD callbacks down as props to whichever view is active. The URL is the source of truth for navigation: `src/routes.js` (pure functions, unit-tested in `tests/routes.test.js`) parses the location into `{view, clientId, tab, activationToken}`, and `App.jsx` derives `view`/`selectedClientId`/`clientTab` from it — never keep them in `useState`; change them with `navigate(viewPath(...))` / `navigate(clientPath(id, tab))`. Routes: `/painel /kanban /calendario /notas /clientes /relatorios /cadastro /equipe /perfil`, `/clientes/:id[?aba=docs]`, `/activate/:token`. Unknown URLs, gestor-only screens opened by a funcionário, and `/clientes/:id` of a client that doesn't exist all redirect (replace) to a valid screen. A new top-level screen needs an entry in `VIEW_KEYS` (and `GESTOR_ONLY_VIEWS` if restricted) plus the `VIEWS` array; `vercel.json` already rewrites every non-`/api` path to `index.html`. Views that don't need to be globally shared (Documentações, Equipe, Clientes listing) fetch their own supplementary data directly via `src/api.js` instead of going through `App` state — check whether a view already receives what it needs as props before adding a new `useEffect` fetch.

### Tasks (TanStack Query)
One collection, four cached views, all under the `['tasks']` key prefix (`TASK_KEYS` in `src/taskCache.js`): `mine` (assigned to me — Kanban, Painel; key includes the user id), `by-client/:id` (client Kanban, all assignees, polls every 6 s), `client-linked` (Calendário, polls 15 s while that screen is open) and `client-stats` (progress on the client list, an object not a list). Queries/mutations are in `src/hooks/useTasks.js`; Screens that own their task data read the cache directly — **Calendário and Painel** call `useMyTasks`/`useClientLinkedTasks`/`useTaskActions` themselves and take no task props; Kanban and the client workspace still receive `tasks`/callbacks from `App.jsx` (the next views to migrate). Prefer the direct-hook style for new code.

Mutations (`useTaskActions`) are optimistic across **every** cached list at once (`patchAllTaskLists`): snapshot → patch → request → on failure restore the snapshot, toast, invalidate. Never hand-sync a task into several lists, and never add a task state in `useState` — add a query key under `['tasks']` instead (a list is anything under that prefix except `client-stats`). Created tasks go into the lists they belong to via `addTaskToLists`; `forceMine` keeps the old behavior that a task created from your own Kanban/Calendário shows up immediately even if assigned to someone else (it disappears on the next refetch — a known quirk, not a feature). `logout` calls `queryClient.clear()`; polling pauses while the browser tab is hidden (TanStack default), so to test it in a headless/background tab fake `document.visibilityState`. Pure cache logic is tested in `tests/taskCache.test.js`.

### Notes (TanStack Query)
One list per user under `NOTE_KEYS.mine(userId)` (`src/noteCache.js`, pure helpers tested in `tests/noteCache.test.js`); `src/hooks/useNotes.js` has `useNotes()` (user id comes from the session, no props) and `useNoteActions()` (create/save/delete/link folder/attachments, toasts included). **Notas, Painel and Documentações all read this same list** — `DocumentsView` used to keep its own copy and hand-sync it; never reintroduce a local `notes` state. Delete and (un)link-to-folder are optimistic with rollback; create/save/attachments wait for the server's version. `saveNote` returns `true/false` so the editor only clears "unsaved changes" when the save really succeeded. `NotesView` is a thin wrapper (spinner on first load, then mounts `NotesWorkspace`) because the editor picks the open note once on mount (incl. the one coming from Documentações via `targetNoteId`).

### Toasts and shared hooks
`src/toast.jsx` provides `ToastProvider` (wrapped in `main.jsx`) and `useToast()` → `{showToast, handleError}` (stable functions). Use it anywhere — hooks and screens — instead of threading `onError`/`onToast` props. Other cached resources follow the same pattern as tasks: `src/hooks/useFolders.js` (`['folders']`, `staleTime: 0`, so screens revalidate on open; only the Painel uses it so far). `App` shows the first-load spinner (`busy`) until general data **and** the first tasks fetch arrive, so Kanban/Painel never flash empty.

### Client-scoped workspace pattern
Selecting a client in `ClientsView` sets `selectedClientId` in `App.jsx`, which swaps the `clientes` view to render `ClientWorkspace` instead of the client list — a Kanban + Documentos tabs UI scoped to that one client, via the `client_id` foreign key present on both `fourbase_tasks` and `fourbase_folders`. Any new client-scoped feature should hang off `ClientWorkspace` rather than introducing a new top-level view (its URL is `/clientes/:id`, sub-tab in `?aba=`).

### Color system
`src/colors.js` exports `assigneeColor(id, overrideColor)` — deterministically hashes an id to a fixed palette color, unless a person/client has picked a custom hex `color` (set via the native `<input type="color">` spectrum picker in `ColorPickerField`, used by `TeamMemberModal`/`ClientModal`). `memberColor(id, list)` is the variant for call sites that only have a foreign key (e.g. `task.assigned_to`) and need to look up the color from a `members`/`clients` array already in scope. This color drives avatars, the Kanban card's left border, and calendar dots — it is deliberately unrelated to task priority, which uses a fixed grayscale scale instead (`.priority-tag.p-*` in `styles.css`).

### Kanban columns are data, not constants
Columns (`todo`/`doing`/`done` plus any custom ones) live in `fourbase_columns` (key/label/position/color), not hardcoded in the frontend. `App.jsx` has a `DEFAULT_COLUMNS` fallback + a per-user `localStorage` cache for the (now rare) case the table has no data yet.

### Icons
`src/icons.jsx` is a hand-rolled SVG icon set (no icon library dependency) built on a shared `Icon` wrapper. Add new icons following that same pattern rather than pulling in a library.

### Deploy
`vercel.json` rewrites `/api/*` to `api/index.js`'s default export, deployed as-is as a serverless function — see the local-mock-DB caveat above before assuming a Vercel preview behaves like local dev.
