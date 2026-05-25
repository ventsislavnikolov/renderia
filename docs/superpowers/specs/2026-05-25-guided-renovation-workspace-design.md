# Guided Renovation Workspace Design

Date: 2026-05-25

## Context

The app, Renderia, will help plan redesign and construction changes for a city house. The current manual workflow uses ChatGPT image generation, but generated images often lose or misplace important fixed elements such as windows and doors. The MVP should make those preservation constraints explicit and repeatable instead of relying on loose prompting.

The workspace is currently empty, so this design assumes a new application.

## Product Scope

Renderia MVP is a Guided Task Workspace for one authenticated user renovating one or more house projects. The main objects are projects, AI-organized renovation tasks, source photos, detected protected elements, design rules, generated briefs, and generated image variations.

Primary flow:

1. Sign in with Supabase Auth magic link.
2. Create or open a house project.
3. Upload photos and optional notes.
4. AI suggests task names and categories from the uploaded material.
5. Open a task and run the guided flow: upload or select a photo, detect fixed elements, confirm clickable overlays, generate a brief, then generate 2-4 image variations.
6. Save selected outputs and notes back to the task.

The MVP goal is to reduce bad renovation outputs by making preservation of windows, doors, and structural context a first-class step before image generation.

## Future Scope

V2 should add shared project access for family, architects, or contractors to view and comment on projects. V2 should also add email/password login. Both MVP and V2 use Supabase, Supabase Auth, and Supabase Storage.

## Architecture

The app will be a TanStack Start React application with Supabase as the persistent backend.

Frontend responsibilities:

- TanStack Router routes for project list, project detail, task detail, and guided generation flow.
- TanStack Query for cached project, task, photo, and generation data.
- A restrained operational UI with a guided stepper inside each task.
- Streamdown for rendering AI-generated design briefs and rationale as Markdown.
- Optional `ai-sdk-tools` usage only where it earns its keep, likely devtools or artifacts after the core MVP is stable.

Server responsibilities:

- TanStack Start server functions for authenticated app actions such as creating projects, creating tasks, updating rules, saving detection confirmations, and creating generation jobs.
- Server routes for file upload/download needs or long-running/streaming endpoints where raw HTTP handling is clearer.
- Server-side ownership validation on every mutation.

AI provider abstraction:

- `analyzePhoto()`
- `suggestTasks()`
- `detectProtectedElements()`
- `createDesignBrief()`
- `generateRenovationImages()`

OpenAI is the first provider implementation. Other providers such as Replicate or Runware can be added later by implementing the same interface without changing the product flow.

Supabase responsibilities:

- Supabase Auth for magic-link sign-in in MVP.
- Postgres tables for projects, tasks, photos, protected elements, briefs, generation jobs, and generated images.
- Supabase Storage buckets for uploaded source photos and generated outputs.
- Row Level Security scoped to the authenticated user.

## Data Model

Core tables:

- `projects`: owned house projects.
- `renovation_tasks`: task-based workspaces such as "2nd floor - ceiling" or "outside facade".
- `photos`: uploaded source images with storage paths, dimensions, and optional notes.
- `task_photos`: links photos to renovation tasks when one photo supports several tasks.
- `protected_elements`: confirmed or AI-suggested fixed elements with labels, bounding boxes, confidence, and status.
- `design_briefs`: structured AI briefs and editable Markdown/rules for a task.
- `generation_jobs`: provider/model/prompt/job status records.
- `generated_images`: output image storage paths, variation metadata, favorite state, and notes.

Every user-owned row includes `owner_id`. Storage paths should include the user id and project id so RLS and storage policies can align.

## Data Flow

Upload and task organization:

1. User uploads one or more house photos plus optional notes.
2. Files go to Supabase Storage.
3. Metadata goes into `photos`.
4. AI reads photo references and notes, then suggests renovation tasks.
5. User accepts or edits suggested tasks before they become active workspace tasks.

Guided task flow:

1. User chooses a task and source photo.
2. `detectProtectedElements()` returns overlay candidates such as windows, doors, stair openings, structural boundaries, roof or ceiling lines, major wall edges, and any "must keep" elements inferred from the prompt.
3. User confirms, deletes, renames, or adjusts simple bounding boxes.
4. Confirmed elements are saved and included in the design brief and image-generation request.
5. `createDesignBrief()` produces a structured brief: goal, preserved elements, allowed changes, materials/style, risks, and generation prompt.
6. User can edit the brief or rules.
7. `generateRenovationImages()` creates 2-4 variations, stores outputs in Supabase Storage, and creates generation records.
8. User marks favorites and adds notes.

The MVP does not promise architectural accuracy or construction feasibility. Outputs are visual concepts that require human review.

## Error Handling And Guardrails

Image fidelity:

- The app requires a confirmation step for protected elements before generation.
- Generation prompts include a structured "preserve exactly" section based on confirmed overlays.
- Each generated image keeps traceability to the source photo, confirmed overlays, provider, model, prompt, and brief version.
- Failed or unsatisfactory generations can be rerun from the same brief with adjusted rules.

AI and provider failures:

- Provider calls create generation job records with statuses: `pending`, `running`, `succeeded`, and `failed`.
- API errors, moderation blocks, timeouts, and missing image outputs are stored with user-readable messages.
- The provider interface keeps model-specific failures from leaking into the UI.
- OpenAI image outputs are copied into Supabase Storage because temporary provider URLs can expire.

Storage and auth:

- Uploads validate file type and size before sending to Supabase Storage.
- RLS policies protect all project data by `owner_id`.
- Server-side code validates ownership on every mutation, even though the app is single-user first.

Product honesty:

- The UI labels outputs as visual concepts.
- Briefs and notes remain attached to generated images so later human review has context.

## Testing

Core tests:

- Unit tests for the AI provider interface using mocked OpenAI responses.
- Unit tests for prompt and brief builders to ensure confirmed protected elements are always included.
- Database/RLS checks for project ownership and storage path ownership.
- Server function tests for create/update flows where practical.

Workflow tests:

- Upload photo metadata.
- Accept AI-suggested task.
- Confirm detected overlays.
- Generate a brief.
- Mock generation success and verify output records point to stored assets.
- Mock provider failure and verify the job moves to failed with a useful message.

UI verification:

- Playwright flow for sign-in bypass/dev auth or mocked auth, then project, task, and guided generation screens.
- Screenshot checks for the task workspace and overlay confirmation view at desktop and mobile widths.
- Manual visual review remains required for real model outputs because image quality cannot be fully automated.

## References

- TanStack Start server functions: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- TanStack Start server routes: https://tanstack.dev/start/latest/docs/framework/react/guide/server-routes
- Supabase TanStack Start quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/tanstack
- Supabase Auth overview: https://supabase.com/docs/guides/auth/
- OpenAI image generation guide: https://platform.openai.com/docs/guides/image-generation
- AI SDK image generation reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-image
- Streamdown: https://streamdown.ai/
- AI SDK Tools: https://github.com/midday-ai/ai-sdk-tools
