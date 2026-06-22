# 360 step — design (HITL deliverable for #76)

The "360" step sits between **Preview** and **Brief**:

`Upload → Review → Merge → Preview → 360 → Brief → Generate`

It builds, shows, and approves the **Room Composite** — a single 3:2 wide
empty-room view synthesised from every approved Structural Preview. UI label is
"360 view"; code/types/table use Room Composite (see CONTEXT.md, ADR 0002).

Reachability: the step is enabled only when `allPreviewsApproved(roomState)` is
true (every kept photo has an approved Structural Preview — slice #75).

Visual idiom matches the other steps: a single `border border-border bg-surface
p-10` card, `font-display` numbered heading, `Button` primitives, `role=status`
progress line.

## State machine

```
            ┌─────────────┐  Build 360 view   ┌──────────┐
   enter ──▶│  not-built  │ ────────────────▶ │ building │
            └─────────────┘                   └────┬─────┘
                  ▲                                 │ synthesis returns
                  │ Re-synthesize                   ▼
                  │                        ┌───────────────────┐
                  └──────────────────────  │ awaiting-approval │
                                           └─────────┬─────────┘
                                                     │ Approve
                                                     ▼
                                              ┌────────────┐
                                              │  approved  │ ─▶ unlocks Brief
                                              └────────────┘
```

Invalidation: going back and changing room evidence (re-generating any angle,
editing appearances/objects) clears approvals via `invalidatePreview`, which
drops the composite back to `not-built` on return.

## State: not-built

```
┌──────────────────────────────────────────────────────────────┐
│ 05 / 360 view                                                  │
│                                                                │
│ 5. Build the 360 view                                          │
│ Combine your approved angles into one wide empty-room view of  │
│ the whole captured room. The design is generated against this  │
│ view, so it reflects the full room — not a single angle.       │
│                                                                │
│ Source angles (3 approved)                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐                              │
│  │ ✓ IMG  │ │ ✓ IMG  │ │ ✓ IMG  │   ← approved preview thumbs  │
│  │ wall A │ │ wall B │ │ corner │                              │
│  └────────┘ └────────┘ └────────┘                              │
│                                                                │
│ [ Build 360 view ]                                             │
│                                                                │
│ ⓘ This is a wide composite of the angles you photographed,    │
│   not a literal 360° wrap-around.                              │
└──────────────────────────────────────────────────────────────┘
```

## State: building

```
┌──────────────────────────────────────────────────────────────┐
│ 5. Build the 360 view                                          │
│                                                                │
│  ░░░░░░░░░░░░░░░░░░░░  Synthesising 360 view…                  │
│  (skeleton at 3:2 aspect)                                      │
│                                                                │
│ [ Building… ] (disabled)                                       │
└──────────────────────────────────────────────────────────────┘
```

## State: awaiting-approval

```
┌──────────────────────────────────────────────────────────────┐
│ 5. Build the 360 view                                          │
│ Check the wide view matches your room before furnishing it.    │
│                                                                │
│ ┌────────────────────────────────────────────────────────┐   │
│ │                  3:2 wide empty-room composite           │   │
│ │              (max-h, object-contain, bordered)           │   │
│ └────────────────────────────────────────────────────────┘   │
│ Approve only if walls, openings, and kept objects look right.  │
│                                                                │
│ [ Approve 360 view ]   [ Re-synthesize ]   (error? inline)    │
└──────────────────────────────────────────────────────────────┘
```

## State: approved

```
┌──────────────────────────────────────────────────────────────┐
│ 5. Build the 360 view            ✓ Approved — ready for Brief  │
│                                                                │
│ ┌────────────────────────────────────────────────────────┐   │
│ │                  3:2 wide empty-room composite           │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                                │
│ [ Re-synthesize ]   (re-opens approval; clears Brief gate)     │
└──────────────────────────────────────────────────────────────┘
```

On Approve, advance to Brief (mirrors `onApproved` in the current preview step).

## Notes for the build slice (#77)

- Persist the composite in `room_composites` (status: generated → approved →
  superseded; supersede the prior on each re-synthesis). Approval gate mirrors
  the per-photo preview pattern from #75.
- Brief unlocks on composite-approved; this becomes the new `reached.brief`
  predicate (replacing `allPreviewsApproved` as the Brief gate — that now gates
  the 360 step instead).
- Empty/edge cases: 1 approved angle still builds (a wider single view); a
  back-edit that invalidates approvals must reset the composite to not-built.
```
