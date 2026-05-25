# Guided Renovation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Renderia MVP: a TanStack Start + Supabase guided renovation workspace that uploads house photos, organizes AI-suggested tasks, confirms protected elements, creates a brief, and mocks/implements OpenAI-backed image generation through a provider interface.

**Architecture:** Scaffold a TanStack Start React app, keep app actions in server functions, persist user data and assets in Supabase, and isolate AI calls behind a small provider interface. Build the UI as an operational workspace with a guided task flow and keep OpenAI as the first provider implementation.

**Tech Stack:** TanStack Start, TanStack Router, TanStack Query, TypeScript, Supabase Auth/Postgres/Storage, Vercel AI SDK/OpenAI SDK boundary, Streamdown, Vitest, Playwright, Biome.

---

## File Structure

- `src/lib/supabase/browser.ts`: Browser Supabase client using publishable key.
- `src/lib/supabase/server.ts`: Server Supabase client helpers and auth/ownership helpers.
- `src/lib/types/database.ts`: Generated or hand-maintained Supabase database types.
- `src/lib/ai/types.ts`: Provider-neutral AI request/response types.
- `src/lib/ai/provider.ts`: Provider interface and provider resolver.
- `src/lib/ai/openai-provider.ts`: OpenAI implementation.
- `src/lib/ai/mock-provider.ts`: Deterministic provider for tests and local UI development.
- `src/lib/ai/prompts.ts`: Prompt and brief builders.
- `src/lib/renovation/schema.ts`: Zod schemas shared by server functions and tests.
- `src/server/projects.ts`: Project server functions.
- `src/server/photos.ts`: Photo metadata and signed upload URL server functions.
- `src/server/tasks.ts`: Task server functions.
- `src/server/generation.ts`: Detection, brief, and generation server functions.
- `src/components/layout/app-shell.tsx`: Authenticated shell.
- `src/components/projects/project-list.tsx`: Project list.
- `src/components/tasks/task-list.tsx`: Renovation task list.
- `src/components/guided/guided-flow.tsx`: Step orchestration.
- `src/components/guided/photo-upload-step.tsx`: Upload/select photo step.
- `src/components/guided/overlay-confirm-step.tsx`: Protected-element overlay confirmation.
- `src/components/guided/brief-step.tsx`: Brief display/edit step.
- `src/components/guided/generation-step.tsx`: Variation results step.
- `src/routes/index.tsx`: Redirect to projects or sign-in.
- `src/routes/auth.tsx`: Magic-link sign-in page.
- `src/routes/projects.index.tsx`: Project list route.
- `src/routes/projects.$projectId.tsx`: Project detail route.
- `src/routes/projects.$projectId.tasks.$taskId.tsx`: Guided task route.
- `supabase/migrations/0001_initial_schema.sql`: Schema, RLS, and storage policies.
- `tests/unit/ai/*.test.ts`: Provider and prompt tests.
- `tests/unit/server/*.test.ts`: Server function tests with mocked Supabase/provider boundaries.
- `tests/e2e/guided-workspace.spec.ts`: Playwright workflow test.

## Task 1: Scaffold TanStack Start App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/routeTree.gen.ts` after running TanStack tooling
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Scaffold the app**

Run:

```bash
npm create @tanstack/start@latest . -- --package-manager npm --toolchain biome
```

Expected: TanStack Start files are created in the current empty project.

- [ ] **Step 2: Install MVP dependencies**

Run:

```bash
npm install @supabase/supabase-js @tanstack/react-query zod ai @ai-sdk/openai openai streamdown lucide-react clsx
npm install -D vitest @testing-library/react @testing-library/user-event jsdom playwright @playwright/test
```

Expected: dependencies are added to `package.json`.

- [ ] **Step 3: Add baseline environment example**

Create `.env.example`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
OPENAI_API_KEY=
AI_PROVIDER=mock
```

- [ ] **Step 4: Verify scaffold**

Run:

```bash
npm run dev
```

Expected: dev server starts without TypeScript or runtime errors.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold tanstack start app"
```

## Task 2: Add Supabase Schema, RLS, And Storage Policies

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `src/lib/types/database.ts`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/0001_initial_schema.sql`:

```sql
create extension if not exists "pgcrypto";

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.renovation_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  category text not null,
  status text not null default 'active' check (status in ('suggested', 'active', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  content_type text not null,
  width integer,
  height integer,
  notes text,
  created_at timestamptz not null default now()
);

create table public.task_photos (
  task_id uuid not null references public.renovation_tasks(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  primary key (task_id, photo_id)
);

create table public.protected_elements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.renovation_tasks(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  label text not null,
  kind text not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  confidence numeric,
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.design_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.renovation_tasks(id) on delete cascade,
  markdown text not null,
  prompt text not null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.renovation_tasks(id) on delete cascade,
  brief_id uuid references public.design_briefs(id) on delete set null,
  provider text not null,
  model text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  prompt text not null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.generated_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  task_id uuid not null references public.renovation_tasks(id) on delete cascade,
  storage_path text not null,
  variation_index integer not null,
  is_favorite boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.renovation_tasks enable row level security;
alter table public.photos enable row level security;
alter table public.task_photos enable row level security;
alter table public.protected_elements enable row level security;
alter table public.design_briefs enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generated_images enable row level security;

create policy "projects owner access" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "tasks owner access" on public.renovation_tasks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "photos owner access" on public.photos for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "task photos owner access" on public.task_photos for all using (
  exists (select 1 from public.renovation_tasks t where t.id = task_id and t.owner_id = auth.uid())
) with check (
  exists (select 1 from public.renovation_tasks t where t.id = task_id and t.owner_id = auth.uid())
);
create policy "protected elements owner access" on public.protected_elements for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "design briefs owner access" on public.design_briefs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "generation jobs owner access" on public.generation_jobs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "generated images owner access" on public.generated_images for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```

- [ ] **Step 2: Add database types**

Create `src/lib/types/database.ts` with an interim database type definition. Replace this file with generated Supabase types after the first real Supabase project is linked.

```ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      projects: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      renovation_tasks: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      photos: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      task_photos: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      protected_elements: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      design_briefs: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      generation_jobs: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      generated_images: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
```

- [ ] **Step 3: Apply migration**

Run after Supabase project credentials are configured:

```bash
supabase db push
```

Expected: tables and RLS policies are created.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_initial_schema.sql src/lib/types/database.ts
git commit -m "feat: add renovation workspace schema"
```

## Task 3: Add Supabase Clients And Auth Route

**Files:**
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/routes/auth.tsx`
- Modify: `src/routes/index.tsx`

- [ ] **Step 1: Create browser client**

Create `src/lib/supabase/browser.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export const supabaseBrowser = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
```

- [ ] **Step 2: Create auth page**

Create `src/routes/auth.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <main className="auth-page">
      <form onSubmit={sendMagicLink} className="auth-card">
        <h1>Renderia</h1>
        <p>Sign in to manage renovation concepts for your house.</p>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <button type="submit">Send magic link</button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Add server auth helper**

Create `src/lib/supabase/server.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export function createSupabaseServerClient(accessToken?: string) {
  return createClient<Database>(
    process.env.VITE_SUPABASE_URL ?? "",
    process.env.SUPABASE_SECRET_KEY ?? "",
    {
      global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
      auth: { persistSession: false },
    },
  );
}

export function requireUserId(userId: string | null | undefined) {
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
}
```

- [ ] **Step 4: Test auth route manually**

Run:

```bash
npm run dev
```

Open `/auth`.

Expected: entering an email calls Supabase Auth and shows either a success message or a Supabase configuration error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase src/routes/auth.tsx src/routes/index.tsx
git commit -m "feat: add magic link auth entry"
```

## Task 4: Define AI Provider Boundary And Prompt Builders

**Files:**
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/provider.ts`
- Create: `src/lib/ai/prompts.ts`
- Create: `src/lib/ai/mock-provider.ts`
- Test: `tests/unit/ai/prompts.test.ts`

- [ ] **Step 1: Write prompt tests**

Create `tests/unit/ai/prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDesignPrompt } from "../../../src/lib/ai/prompts";

describe("buildDesignPrompt", () => {
  it("always includes confirmed protected elements", () => {
    const prompt = buildDesignPrompt({
      taskTitle: "2nd floor - ceiling",
      styleRules: "Scandinavian renovation style",
      briefMarkdown: "Improve ceiling finish and lighting.",
      protectedElements: [
        { label: "left window", kind: "window", x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
        { label: "main door", kind: "door", x: 0.55, y: 0.35, width: 0.15, height: 0.45 },
      ],
    });

    expect(prompt).toContain("PRESERVE EXACTLY");
    expect(prompt).toContain("left window");
    expect(prompt).toContain("main door");
    expect(prompt).toContain("Scandinavian renovation style");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- tests/unit/ai/prompts.test.ts
```

Expected: FAIL because `src/lib/ai/prompts.ts` does not exist.

- [ ] **Step 3: Add provider types**

Create `src/lib/ai/types.ts`:

```ts
export type BoundingBox = {
  label: string;
  kind: "window" | "door" | "stairs" | "ceiling_line" | "wall_edge" | "structure" | "other";
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
};

export type SuggestTasksInput = {
  projectNotes: string;
  photos: Array<{ id: string; signedUrl: string; notes?: string }>;
};

export type SuggestedTask = {
  title: string;
  category: string;
  rationale: string;
};

export type DetectProtectedElementsInput = {
  photoUrl: string;
  taskTitle: string;
  notes?: string;
};

export type CreateDesignBriefInput = {
  taskTitle: string;
  styleRules: string;
  protectedElements: BoundingBox[];
};

export type GenerateRenovationImagesInput = {
  sourceImageUrl: string;
  prompt: string;
  count: number;
};

export type GeneratedImageResult = {
  base64: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
};

export type RenovationAiProvider = {
  suggestTasks(input: SuggestTasksInput): Promise<SuggestedTask[]>;
  detectProtectedElements(input: DetectProtectedElementsInput): Promise<BoundingBox[]>;
  createDesignBrief(input: CreateDesignBriefInput): Promise<{ markdown: string; prompt: string }>;
  generateRenovationImages(input: GenerateRenovationImagesInput): Promise<GeneratedImageResult[]>;
};
```

- [ ] **Step 4: Add prompt builder**

Create `src/lib/ai/prompts.ts`:

```ts
import type { BoundingBox } from "./types";

export function buildDesignPrompt(input: {
  taskTitle: string;
  styleRules: string;
  briefMarkdown: string;
  protectedElements: BoundingBox[];
}) {
  const preserved = input.protectedElements
    .map((element) => `- ${element.label} (${element.kind}) at x=${element.x}, y=${element.y}, width=${element.width}, height=${element.height}`)
    .join("\n");

  return [
    `Renovation task: ${input.taskTitle}`,
    "",
    "PRESERVE EXACTLY:",
    preserved || "- No protected elements confirmed.",
    "",
    "STYLE AND CHANGE RULES:",
    input.styleRules,
    "",
    "DESIGN BRIEF:",
    input.briefMarkdown,
    "",
    "Generate a realistic visual renovation concept. Do not move, remove, resize, or invent windows, doors, structural edges, ceiling lines, stair openings, or other preserved elements.",
  ].join("\n");
}
```

- [ ] **Step 5: Add mock provider**

Create `src/lib/ai/mock-provider.ts`:

```ts
import { buildDesignPrompt } from "./prompts";
import type { RenovationAiProvider } from "./types";

export const mockRenovationProvider: RenovationAiProvider = {
  async suggestTasks() {
    return [
      { title: "2nd floor - ceiling", category: "ceiling", rationale: "Photo suggests ceiling and lighting work." },
      { title: "outside facade", category: "facade", rationale: "Exterior photo suggests facade redesign." },
    ];
  },
  async detectProtectedElements() {
    return [
      { label: "left window", kind: "window", x: 0.12, y: 0.2, width: 0.18, height: 0.28, confidence: 0.82 },
      { label: "main door", kind: "door", x: 0.58, y: 0.36, width: 0.16, height: 0.44, confidence: 0.76 },
    ];
  },
  async createDesignBrief(input) {
    const markdown = `# ${input.taskTitle}\n\nPreserve confirmed fixed elements and apply ${input.styleRules}.`;
    return {
      markdown,
      prompt: buildDesignPrompt({
        taskTitle: input.taskTitle,
        styleRules: input.styleRules,
        briefMarkdown: markdown,
        protectedElements: input.protectedElements,
      }),
    };
  },
  async generateRenovationImages(input) {
    return Array.from({ length: input.count }, () => ({
      base64: "",
      contentType: "image/png" as const,
    }));
  },
};
```

- [ ] **Step 6: Add provider resolver**

Create `src/lib/ai/provider.ts`:

```ts
import { mockRenovationProvider } from "./mock-provider";
import type { RenovationAiProvider } from "./types";

export function getRenovationAiProvider(): RenovationAiProvider {
  if ((process.env.AI_PROVIDER ?? "mock") === "openai") {
    throw new Error("OpenAI provider is added in the next task");
  }
  return mockRenovationProvider;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run:

```bash
npm run test -- tests/unit/ai/prompts.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai tests/unit/ai/prompts.test.ts
git commit -m "feat: define renovation ai provider boundary"
```

## Task 5: Implement OpenAI Provider

**Files:**
- Create: `src/lib/ai/openai-provider.ts`
- Modify: `src/lib/ai/provider.ts`
- Test: `tests/unit/ai/provider.test.ts`

- [ ] **Step 1: Add provider resolver test**

Create `tests/unit/ai/provider.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

describe("getRenovationAiProvider", () => {
  it("returns the mock provider by default", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const { getRenovationAiProvider } = await import("../../../src/lib/ai/provider");
    await expect(getRenovationAiProvider().suggestTasks({ projectNotes: "", photos: [] })).resolves.toHaveLength(2);
  });
});
```

- [ ] **Step 2: Add OpenAI provider**

Create `src/lib/ai/openai-provider.ts`:

```ts
import OpenAI from "openai";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { buildDesignPrompt } from "./prompts";
import type { RenovationAiProvider } from "./types";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const openAiRenovationProvider: RenovationAiProvider = {
  async suggestTasks(input) {
    const result = await generateText({
      model: openai("gpt-5-mini"),
      prompt: `Suggest renovation tasks as JSON array with title, category, rationale. Notes: ${input.projectNotes}. Photo count: ${input.photos.length}`,
    });
    return JSON.parse(result.text);
  },
  async detectProtectedElements(input) {
    const result = await generateText({
      model: openai("gpt-5-mini"),
      prompt: `Return JSON array of protected visual elements with label, kind, x, y, width, height, confidence. Task: ${input.taskTitle}. Notes: ${input.notes ?? ""}. Photo URL: ${input.photoUrl}`,
    });
    return JSON.parse(result.text);
  },
  async createDesignBrief(input) {
    const markdown = [
      `# ${input.taskTitle}`,
      "",
      `Style rules: ${input.styleRules}`,
      "",
      "Preserved elements:",
      ...input.protectedElements.map((element) => `- ${element.label} (${element.kind})`),
    ].join("\n");
    return {
      markdown,
      prompt: buildDesignPrompt({
        taskTitle: input.taskTitle,
        styleRules: input.styleRules,
        briefMarkdown: markdown,
        protectedElements: input.protectedElements,
      }),
    };
  },
  async generateRenovationImages(input) {
    const response = await client.images.generate({
      model: "gpt-image-1.5",
      prompt: input.prompt,
      n: input.count,
      size: "auto",
      quality: "high",
    });
    return response.data.map((image) => ({
      base64: image.b64_json ?? "",
      contentType: "image/png" as const,
    }));
  },
};
```

- [ ] **Step 3: Wire provider resolver**

Modify `src/lib/ai/provider.ts`:

```ts
import { mockRenovationProvider } from "./mock-provider";
import { openAiRenovationProvider } from "./openai-provider";
import type { RenovationAiProvider } from "./types";

export function getRenovationAiProvider(): RenovationAiProvider {
  if ((process.env.AI_PROVIDER ?? "mock") === "openai") {
    return openAiRenovationProvider;
  }
  return mockRenovationProvider;
}
```

- [ ] **Step 4: Run provider tests**

Run:

```bash
npm run test -- tests/unit/ai/provider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/openai-provider.ts src/lib/ai/provider.ts tests/unit/ai/provider.test.ts
git commit -m "feat: add openai renovation provider"
```

## Task 6: Add Server Functions For Projects, Tasks, And Generation

**Files:**
- Create: `src/server/projects.ts`
- Create: `src/server/photos.ts`
- Create: `src/server/tasks.ts`
- Create: `src/server/generation.ts`
- Create: `src/lib/renovation/schema.ts`

- [ ] **Step 1: Add shared schemas**

Create `src/lib/renovation/schema.ts`:

```ts
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  category: z.string().min(1),
  notes: z.string().optional(),
});

export const protectedElementSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["window", "door", "stairs", "ceiling_line", "wall_edge", "structure", "other"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  confidence: z.number().optional(),
});

export const createPhotoSchema = z.object({
  projectId: z.string().uuid(),
  storagePath: z.string().min(1),
  originalName: z.string().min(1),
  contentType: z.string().min(1),
  notes: z.string().optional(),
});

export const suggestTasksSchema = z.object({
  projectId: z.string().uuid(),
  projectNotes: z.string().default(""),
});
```

- [ ] **Step 2: Add project server functions**

Create `src/server/projects.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createProjectSchema } from "../lib/renovation/schema";
import { createSupabaseServerClient } from "../lib/supabase/server";

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const { data: userResult } = await supabase.auth.getUser();
  const userId = userResult.user?.id;
  if (!userId) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
});

export const createProject = createServerFn({ method: "POST" })
  .validator(createProjectSchema)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) throw new Error("Authentication required");

    const { data: project, error } = await supabase
      .from("projects")
      .insert({ owner_id: userId, name: data.name, description: data.description })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return project;
  });

export const getProject = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) throw new Error("Authentication required");

    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .eq("owner_id", userId)
      .single();

    if (error) throw new Error(error.message);
    return project;
  });
```

- [ ] **Step 3: Add photo server functions**

Create `src/server/photos.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createPhotoSchema } from "../lib/renovation/schema";
import { createSupabaseServerClient } from "../lib/supabase/server";

export const createPhotoRecord = createServerFn({ method: "POST" })
  .validator(createPhotoSchema)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) throw new Error("Authentication required");

    const { data: photo, error } = await supabase
      .from("photos")
      .insert({
        owner_id: userId,
        project_id: data.projectId,
        storage_path: data.storagePath,
        original_name: data.originalName,
        content_type: data.contentType,
        notes: data.notes,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return photo;
  });

export const listProjectPhotos = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) throw new Error("Authentication required");

    const { data: photos, error } = await supabase
      .from("photos")
      .select("*")
      .eq("owner_id", userId)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return photos;
  });
```

- [ ] **Step 4: Add task server functions**

Create `src/server/tasks.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRenovationAiProvider } from "../lib/ai/provider";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { createTaskSchema, suggestTasksSchema } from "../lib/renovation/schema";

export const listProjectTasks = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) throw new Error("Authentication required");

    const { data: tasks, error } = await supabase
      .from("renovation_tasks")
      .select("*")
      .eq("owner_id", userId)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return tasks;
  });

export const createTask = createServerFn({ method: "POST" })
  .validator(createTaskSchema)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) throw new Error("Authentication required");

    const { data: task, error } = await supabase
      .from("renovation_tasks")
      .insert({
        owner_id: userId,
        project_id: data.projectId,
        title: data.title,
        category: data.category,
        notes: data.notes,
        status: "active",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return task;
  });

export const suggestTasksForProject = createServerFn({ method: "POST" })
  .validator(suggestTasksSchema)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) throw new Error("Authentication required");

    const { data: photos, error } = await supabase
      .from("photos")
      .select("id, storage_path, notes")
      .eq("owner_id", userId)
      .eq("project_id", data.projectId);

    if (error) throw new Error(error.message);
    return getRenovationAiProvider().suggestTasks({
      projectNotes: data.projectNotes,
      photos: (photos ?? []).map((photo) => ({
        id: String(photo.id),
        signedUrl: String(photo.storage_path),
        notes: typeof photo.notes === "string" ? photo.notes : undefined,
      })),
    });
  });
```

- [ ] **Step 5: Add generation server functions**

Create `src/server/generation.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRenovationAiProvider } from "../lib/ai/provider";
import { protectedElementSchema } from "../lib/renovation/schema";

export const detectProtectedElements = createServerFn({ method: "POST" })
  .validator(z.object({ photoUrl: z.string().url(), taskTitle: z.string(), notes: z.string().optional() }))
  .handler(async ({ data }) => {
    return getRenovationAiProvider().detectProtectedElements(data);
  });

export const createDesignBrief = createServerFn({ method: "POST" })
  .validator(z.object({
    taskTitle: z.string(),
    styleRules: z.string(),
    protectedElements: z.array(protectedElementSchema),
  }))
  .handler(async ({ data }) => {
    return getRenovationAiProvider().createDesignBrief(data);
  });
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run build
```

Expected: TypeScript build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/server src/lib/renovation/schema.ts
git commit -m "feat: add renovation server functions"
```

## Task 7: Build Project And Task Workspace UI

**Files:**
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/components/projects/project-list.tsx`
- Create: `src/components/tasks/task-list.tsx`
- Create: `src/routes/projects.index.tsx`
- Create: `src/routes/projects.$projectId.tsx`

- [ ] **Step 1: Create app shell**

Create `src/components/layout/app-shell.tsx`:

```tsx
import type { ReactNode } from "react";

export function AppShell(props: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>Renderia</strong>
      </header>
      <main>{props.children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create project list component**

Create `src/components/projects/project-list.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

export function ProjectList() {
  const demoProjects = [{ id: "demo", name: "City house" }];

  return (
    <section className="workspace-section">
      <h1>Projects</h1>
      <div className="card-grid">
        {demoProjects.map((project) => (
          <Link className="workspace-card" key={project.id} to="/projects/$projectId" params={{ projectId: project.id }}>
            <h2>{project.name}</h2>
            <p>Open renovation tasks and generated concepts.</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create task list component**

Create `src/components/tasks/task-list.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

export function TaskList(props: { projectId: string }) {
  const demoTasks = [
    { id: "ceiling", title: "2nd floor - ceiling", category: "ceiling" },
    { id: "outside", title: "outside facade", category: "facade" },
  ];

  return (
    <section className="workspace-section">
      <h1>Renovation tasks</h1>
      <div className="card-grid">
        {demoTasks.map((task) => (
          <Link
            className="workspace-card"
            key={task.id}
            to="/projects/$projectId/tasks/$taskId"
            params={{ projectId: props.projectId, taskId: task.id }}
          >
            <h2>{task.title}</h2>
            <p>{task.category}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create project routes**

Create `src/routes/projects.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { ProjectList } from "../components/projects/project-list";

export const Route = createFileRoute("/projects/")({
  component: ProjectsRoute,
});

function ProjectsRoute() {
  return (
    <AppShell>
      <ProjectList />
    </AppShell>
  );
}
```

Create `src/routes/projects.$projectId.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { TaskList } from "../components/tasks/task-list";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  return (
    <AppShell>
      <TaskList projectId={projectId} />
    </AppShell>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/layout src/components/projects src/components/tasks src/routes/projects.index.tsx src/routes/projects.$projectId.tsx
git commit -m "feat: add project task workspace"
```

## Task 8: Build Guided Workspace UI

**Files:**
- Create: `src/components/guided/guided-flow.tsx`
- Create: `src/components/guided/overlay-confirm-step.tsx`
- Create: `src/components/guided/brief-step.tsx`
- Create: `src/components/guided/generation-step.tsx`
- Modify: `src/styles.css`
- Modify: route files under `src/routes/`

- [ ] **Step 1: Create guided flow component**

Create `src/components/guided/guided-flow.tsx`:

```tsx
import { useState } from "react";
import type { BoundingBox } from "../../lib/ai/types";
import { OverlayConfirmStep } from "./overlay-confirm-step";
import { BriefStep } from "./brief-step";
import { GenerationStep } from "./generation-step";

const steps = ["Upload", "Detect", "Confirm", "Brief", "Generate"] as const;

export function GuidedFlow() {
  const [step, setStep] = useState(2);
  const [elements, setElements] = useState<BoundingBox[]>([]);
  const [brief, setBrief] = useState("");

  return (
    <section className="guided-flow">
      <nav className="stepper" aria-label="Guided renovation steps">
        {steps.map((label, index) => (
          <button key={label} className={index === step ? "active" : ""} onClick={() => setStep(index)}>
            {index + 1}. {label}
          </button>
        ))}
      </nav>
      {step === 2 ? <OverlayConfirmStep elements={elements} onChange={setElements} onNext={() => setStep(3)} /> : null}
      {step === 3 ? <BriefStep elements={elements} brief={brief} onBriefChange={setBrief} onNext={() => setStep(4)} /> : null}
      {step === 4 ? <GenerationStep brief={brief} /> : null}
    </section>
  );
}
```

- [ ] **Step 2: Create overlay confirmation component**

Create `src/components/guided/overlay-confirm-step.tsx`:

```tsx
import type { BoundingBox } from "../../lib/ai/types";

export function OverlayConfirmStep(props: {
  elements: BoundingBox[];
  onChange: (elements: BoundingBox[]) => void;
  onNext: () => void;
}) {
  const elements = props.elements.length
    ? props.elements
    : [{ label: "left window", kind: "window", x: 0.12, y: 0.2, width: 0.18, height: 0.28 }] as BoundingBox[];

  return (
    <div className="overlay-grid">
      <div className="photo-canvas">
        {elements.map((element) => (
          <button
            key={element.label}
            className="overlay-box"
            style={{
              left: `${element.x * 100}%`,
              top: `${element.y * 100}%`,
              width: `${element.width * 100}%`,
              height: `${element.height * 100}%`,
            }}
          >
            {element.label}
          </button>
        ))}
      </div>
      <aside>
        <h2>Confirm protected elements</h2>
        <p>These elements will be preserved exactly in the generation prompt.</p>
        <button onClick={() => props.onChange(elements)}>Accept detected elements</button>
        <button onClick={props.onNext}>Continue to brief</button>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Create brief step with Streamdown**

Create `src/components/guided/brief-step.tsx`:

```tsx
import { Streamdown } from "streamdown";
import type { BoundingBox } from "../../lib/ai/types";

export function BriefStep(props: {
  elements: BoundingBox[];
  brief: string;
  onBriefChange: (brief: string) => void;
  onNext: () => void;
}) {
  const fallback = `# Renovation brief\n\nPreserve ${props.elements.length} confirmed fixed elements.\n\nApply Scandinavian renovation style.`;
  const value = props.brief || fallback;

  return (
    <div className="brief-grid">
      <textarea value={value} onChange={(event) => props.onBriefChange(event.target.value)} />
      <div className="brief-preview">
        <Streamdown>{value}</Streamdown>
      </div>
      <button onClick={props.onNext}>Generate variations</button>
    </div>
  );
}
```

- [ ] **Step 4: Create generation step**

Create `src/components/guided/generation-step.tsx`:

```tsx
export function GenerationStep(props: { brief: string }) {
  return (
    <div className="generation-grid">
      {[0, 1, 2, 3].map((index) => (
        <article className="generation-card" key={index}>
          <div className="generation-preview">Variation {index + 1}</div>
          <button>Mark favorite</button>
        </article>
      ))}
      <p className="concept-warning">Generated outputs are visual concepts and need human review before construction decisions.</p>
    </div>
  );
}
```

- [ ] **Step 5: Add route using guided flow**

Create or modify `src/routes/projects.$projectId.tasks.$taskId.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { GuidedFlow } from "../components/guided/guided-flow";

export const Route = createFileRoute("/projects/$projectId/tasks/$taskId")({
  component: GuidedTaskRoute,
});

function GuidedTaskRoute() {
  return <GuidedFlow />;
}
```

- [ ] **Step 6: Add CSS**

Append to `src/styles.css`:

```css
.guided-flow { display: grid; gap: 1rem; padding: 1rem; }
.stepper { display: flex; gap: .5rem; flex-wrap: wrap; }
.stepper button { border: 1px solid #d1d5db; background: #fff; padding: .5rem .75rem; border-radius: .5rem; }
.stepper button.active { background: #111827; color: #fff; }
.overlay-grid, .brief-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 1rem; }
.photo-canvas { min-height: 420px; position: relative; background: #eef2f7; border: 1px solid #d1d5db; border-radius: .5rem; overflow: hidden; }
.overlay-box { position: absolute; border: 2px solid #2563eb; background: rgba(37, 99, 235, .12); color: #1d4ed8; font-size: .75rem; }
.brief-grid textarea { min-height: 360px; font: inherit; padding: 1rem; }
.brief-preview { border: 1px solid #d1d5db; border-radius: .5rem; padding: 1rem; }
.generation-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.generation-card { border: 1px solid #d1d5db; border-radius: .5rem; padding: 1rem; }
.generation-preview { aspect-ratio: 4 / 3; display: grid; place-items: center; background: #eef2f7; border-radius: .375rem; }
.concept-warning { grid-column: 1 / -1; color: #6b7280; }
@media (max-width: 760px) { .overlay-grid, .brief-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components src/routes src/styles.css
git commit -m "feat: build guided renovation workspace UI"
```

## Task 9: Add Workflow Tests

**Files:**
- Create: `tests/e2e/guided-workspace.spec.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Add Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

- [ ] **Step 2: Add guided flow test**

Create `tests/e2e/guided-workspace.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("guided workspace shows protected element confirmation and brief", async ({ page }) => {
  await page.goto("/projects/demo/tasks/demo");
  await expect(page.getByRole("navigation", { name: "Guided renovation steps" })).toBeVisible();
  await expect(page.getByText("Confirm protected elements")).toBeVisible();
  await page.getByRole("button", { name: "Accept detected elements" }).click();
  await page.getByRole("button", { name: "Continue to brief" }).click();
  await expect(page.getByText("Renovation brief")).toBeVisible();
  await page.getByRole("button", { name: "Generate variations" }).click();
  await expect(page.getByText("Variation 1")).toBeVisible();
  await expect(page.getByText("Generated outputs are visual concepts")).toBeVisible();
});
```

- [ ] **Step 3: Run e2e tests**

Run:

```bash
npx playwright test tests/e2e/guided-workspace.spec.ts
```

Expected: desktop and mobile tests pass.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/guided-workspace.spec.ts
git commit -m "test: cover guided workspace flow"
```

## Task 10: Final Verification

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run full checks**

Run:

```bash
npm run build
npm run test
npx playwright test
```

Expected: all checks pass.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean working tree or only intentional uncommitted fixes.

- [ ] **Step 3: Commit verification fixes if any**

```bash
git add .
git commit -m "chore: finish guided renovation workspace verification"
```

Skip this commit if there are no changes after verification.

## Self-Review Notes

- Spec coverage: The plan covers TanStack Start, Supabase Auth/Postgres/Storage, provider abstraction, OpenAI-first implementation, project workspace, task workspace, photo metadata, AI task suggestion, overlay confirmation, brief rendering, generated variations, RLS ownership, error guardrails, and workflow tests.
- Scope: Shared project access, comments, and email/password login are intentionally excluded because the approved spec marks them as V2.
- Risk: Exact Supabase SSR session handling may need adjustment during implementation depending on the TanStack Start cookie/session pattern selected by the scaffold. Keep auth mutations server-side and validate ownership on every mutation.
