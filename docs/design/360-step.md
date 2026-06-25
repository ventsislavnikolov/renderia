# "Room" step — design (originally the 360 / Room Composite step, #76)

> **Superseded (per-angle pivot).** This step no longer synthesises a single
> wide "360" Room Composite. Stitching four non-overlapping corner angles into
> one frame produced incoherent collages (visible seams, mismatched
> perspective), so the design is now generated **per approved angle** instead.
> Step 05 became a **read-only review** of the approved angles. See ADR 0002 for
> the original decision and the superseding note.

The step sits between **Preview** and **Brief**:

`Upload → Review → Merge → Preview → Room → Brief → Generate`

It shows every approved Structural Preview side by side so the user confirms the
whole room before writing the brief. There is **no AI synthesis** here. UI label
is "Room"; the component is `RoomReviewStep` (`room-review-step.tsx`).

Reachability: the step — and now the Brief and Generate steps — are enabled when
`allPreviewsApproved(roomState)` is true (every kept photo has an approved
Structural Preview, slice #75). There is no separate composite-approval gate.

Visual idiom matches the other steps: a single `border border-border bg-surface
p-10` card, `font-display` numbered heading, `Button` primitives.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ 5. Review the whole room                                       │
│ These are your N approved angles. The design is generated      │
│ against each one, so it reflects the whole room — every angle  │
│ stays a clean, coherent view rather than one stitched frame.   │
│                                                                │
│  ┌──────────┐ ┌──────────┐                                     │
│  │  angle A │ │  angle B │   ← approved preview thumbnails      │
│  └──────────┘ └──────────┘                                     │
│  ┌──────────┐ ┌──────────┐                                     │
│  │  angle C │ │  angle D │                                     │
│  └──────────┘ └──────────┘                                     │
│                                                                │
│ [ Continue to brief ]                                          │
└──────────────────────────────────────────────────────────────┘
```

The thumbnails come from the wizard's in-memory `previews` record
(`Record<photoId, { id, signedUrl }>`), already loaded by `loadTaskRoomState` —
no extra fetch.

## Generation (step 07)

The design is generated against **each approved angle independently**: one
design concept (a single Take) is rendered on every approved Structural Preview,
producing one image per angle that together cover the whole room. Each output
stays photoreal and coherent because it is an edit of one real photo. See
`__generateRenovationImagesHandler` (the per-angle branch) in
`src/server/generation.ts`.

## Removed composite code

The Room Composite synthesis was removed: the `generateRoomComposite` /
`approveRoomComposite` server fns, the provider's progressive-outpaint method,
the composite prompts, and the `room_composites` table (dropped in migration
0012). Only the read-only review above remains of the old "360" step.
