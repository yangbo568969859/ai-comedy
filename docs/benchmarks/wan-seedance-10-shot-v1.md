# Wan And Seedance 10-Shot Benchmark v1

## Purpose

This is a controlled provider comparison, not a production episode. Every
candidate in one case uses the same approved source assets, output ratio,
duration, prompt version, and candidate count. Reviewers see only the opaque
candidate label, never provider or model identity.

Use three candidates per provider for every case. A failed request is recorded
as a technical failure; it is not silently replaced or removed from the report.

## Required Inputs

- One `character_anchor` and one `style_reference` for all ten cases.
- A `scene_anchor` for B02, B06, and B07.
- A `prop_anchor` for B04.
- A matched `first_frame` and `last_frame` only for B10.
- Every source asset must pass the existing rights gate before a real request.

## Cases

| Code | Category | Duration | Ratio | Controlled intent |
| --- | --- | ---: | --- | --- |
| B01 | Portrait | 4s | 9:16 | Static medium close-up; preserve face, hair, and costume while the character shifts gaze. |
| B02 | Dialogue | 5s | 9:16 | Medium close-up in a rainy corridor; one line of silent listening and a restrained reaction. |
| B03 | Turn | 4s | 9:16 | Character turns from a three-quarter back view to face camera; preserve profile and costume. |
| B04 | Prop interaction | 5s | 9:16 | Character lifts the approved token prop, examines it, then returns it to waist height. |
| B05 | Action | 4s | 9:16 | One controlled forward step and sleeve movement; no combat, weapon, or multiple characters. |
| B06 | Scene transition | 5s | 9:16 | Character moves from a dim interior doorway to a lantern-lit rainy exterior. |
| B07 | Portrait | 4s | 21:9 | Cinematic horizontal close-up with controlled rack focus from foreground lantern to character. |
| B08 | Dialogue | 5s | 9:16 | Two-shot with an unidentifiable silhouette; judge framing and identity stability of the anchored lead only. |
| B09 | Action | 5s | 9:16 | Character walks through shallow rain with restrained cape motion; no abrupt camera cuts. |
| B10 | First/last frame | 5s | adaptive | Connect the approved first and last frame with a single calm pivot movement. |

## Review Rubric

Rate each dimension from 1 to 5. The assessment is advisory and does not
replace content, rights, or AI-labeling approval.

- `identityConsistency`: face, hairstyle, costume, accessories, and body
  proportions retain the approved character identity.
- `sceneConsistency`: scene, lighting, weather, and prop stay coherent with
  their approved reference assets.
- `shotAdherence`: framing, intended action, duration, and required transition
  match the use case.
- `motionQuality`: motion is coherent, anatomically plausible, and free of
  distracting temporal artifacts.
- `technicalQuality`: no unusable black frames, corruption, severe flicker,
  unreadable compression, or unexpected text/watermark.

Record `accepted`, `needs_changes`, or `rejected`, plus a concise reason.
Compare providers by accepted-candidate rate, median score by dimension,
technical-failure rate, p50/p95 completion latency, and cost per accepted
second. Do not rank them by a single subjective average.
