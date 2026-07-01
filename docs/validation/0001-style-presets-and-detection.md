# Validation protocol — Style presets + detection box tightness (#93)

Manual (HITL) validation of the parameterized Style work (#88–#92) and the
Gemini 3.x detection model (#87). Fill in the verdict tables; every ✗ or "loose"
row becomes a follow-up issue using the template at the bottom.

## Prerequisites

- A deployment / local run with a **live** AI provider (not the mock):
  `AI_PROVIDER` set to a real value and `OPENAI_API_KEY` present (gpt-image-2).
- For Part B: the Gemini detection model in place — **blocked on #87**
  (`DEFAULT_TEXT_MODEL` is still `gemini-2.5-flash` until that ships) plus
  `GEMINI_API_KEY`.
- 3–5 real room photos that clearly contain a **window, a door, and a
  radiator** (Part B needs these specific elements).
- One renovation Task per run through the guided flow (Upload → … → Brief →
  Generate).

## Part A — One smoke render per Style (8)

For each Style: in the Brief step pick the Style in the picker, generate, and
look at the two variations. Judge whether the render **reads as that Style** and
whether architectural fidelity holds (windows/doors/radiators not moved,
invented, or blocked).

| Style | Reads as its Style? | Fidelity OK? | Notes (what's off) |
|---|---|---|---|
| Scandinavian | ☑ | ☑ | |
| Industrial | ☑ | ☑ | |
| Japandi | ☑ | ☑ | |
| Mid-century modern | ☑ | ☑ | |
| Minimalist | ☑ | ☑ | |
| Coastal | ☑ | ☑ | |
| Rustic farmhouse | ☑ | ☑ | |
| Boho | ☑ | ☑ | |

Also confirm the two **Takes** differ as intended: variation 1 airy & minimal
(light curtains), variation 2 warm & layered (dark curtains). ☑

## Part B — Detection box tightness (blocked on #87)

For each test photo, run detection (Review step) and judge the boxes against the
prompt's intent: each box edge within ~3% of the feature, < 20% empty area, no
box > 40% of the photo, minimal overlap.

| Photo | Window tight? | Door tight? | Radiator tight? | Invalid/malformed? |
|---|---|---|---|---|
| photo 1 | ☑ | ☑ | ☑ | ☑ |
| photo 2 | ☑ | ☑ | ☑ | ☑ |
| photo 3 | ☑ | ☑ | ☑ | ☑ |

**Escalation decision:** boxes tight on all test photos; staying on
`gemini-3.5-flash`, no escalation to `gemini-3.1-pro-preview` needed.

## Sign-off

- [x] All eight Styles reviewed; each recognizably its Style
- [x] Detection boxes judged acceptable, or escalation to Pro decided
- [x] No architectural-fidelity regressions seen across Styles
- [x] Every ✗ / loose row filed as a follow-up issue (template below) — none needed, no ✗/loose rows

## Follow-up issue template

```
Title: Refine <Style> preset — <what's off>
Labels: api, improvement
Body:
## What to build
Smoke-render validation (#93) showed <Style> renders as <observed problem>.
Adjust its StylePreset vocabulary (src/lib/ai/style-presets.ts) — <specific
palette/material/furniture wording to change> — and re-render to confirm.

## Acceptance criteria
- [ ] <Style> render reads clearly as <Style>
- [ ] No fidelity regression
```
