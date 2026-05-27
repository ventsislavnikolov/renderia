# Renderia

Renderia is a guided renovation workspace for generating visual redesign concepts while preserving fixed room elements such as windows, doors, ceiling lines, and structural edges.

The app is built with TanStack Start, React, Tailwind CSS, Supabase Auth/Postgres/Storage, and a pluggable AI provider layer. The guided task flow is:

1. Create or open a renovation project.
2. Upload or select a source photo.
3. Detect protected elements and confirm the overlay boxes.
4. Generate and edit a design brief.
5. Generate image variations and mark favorites.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env
```

Fill the Supabase values in `.env`. For local UI work without live AI calls, keep:

```bash
AI_PROVIDER=mock
```

Run the app:

```bash
npm run dev
```

The dev server runs on `http://localhost:3000`.

## Environment

Required for app startup:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `AI_PROVIDER`, usually `mock` for local deterministic runs or `openai` for real provider calls

Required only when `AI_PROVIDER=openai` reaches real provider calls:

- `OPENAI_API_KEY` for OpenAI text/image generation

Optional text-model provider keys used by model selection:

- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `ZAI_API_KEY`
- `MOONSHOT_API_KEY`

## Scripts

```bash
npm run dev       # start Vite/TanStack Start dev server
npm run build     # production build into .output/
npm run preview   # preview the production build
npm run check     # Biome lint/format check
npm run test      # Vitest unit tests
npm run test:e2e  # Playwright e2e tests
```

`npm run test:e2e` builds and previews the production app with mocked Supabase/server-function responses, so it does not require a live Supabase project or AI credentials. If Playwright browsers are missing, run:

```bash
npx playwright install chromium
```

## Build And Deploy

Build:

```bash
npm run build
```

Preview locally:

```bash
npm run preview
```

The production output is written to `.output/`. Nitro can run it as a Node server:

```bash
node .output/server/index.mjs
```

Make sure production runtime env vars are available to the server process.

## Database

The initial Supabase schema and RLS policies live in:

```text
supabase/migrations/0001_initial_schema.sql
```

The schema includes private storage buckets for source photos and generated outputs, user-scoped RLS policies, and the `replace_protected_elements` RPC used to atomically replace detection results for a task/photo pair.

## Notes

Generated images are visual concepts, not construction plans. The app keeps source photo, protected elements, design brief, prompt, provider, model, and favorite metadata attached so outputs remain traceable for later human review.
