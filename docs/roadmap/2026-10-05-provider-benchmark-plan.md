# Provider Benchmark Plan

Date: 2026-10-05

## Decision

The product will not select a permanent video-generation provider before an
evidence-based benchmark. The first real integration stage uses two manually
selected provider adapters:

- `wan`: Alibaba Cloud Model Studio Wan 2.7, the cost and domestic-cloud
  baseline.
- `seedance`: Volcengine Seedance 2.5, the high-control, multimodal-reference
  baseline.

Kling is the first challenger after this benchmark. Hailuo and self-hosted
models remain research candidates, not MVP production dependencies.

The business workflow never automatically switches a task to another provider.
A creator explicitly selects a provider and model. Provider selection, model
version, capabilities, cost estimate, and provider-specific options are frozen
in the generation-run snapshot.

## Why

The observed target format is composed from short, highly controlled shots.
It needs reference assets, first/last-frame workflows, repeatable retries, and
human candidate selection more than it needs a single long-video model.

Seedance documents multimodal references, first/last-frame generation,
asynchronous callbacks, and up-to-30-second outputs. Wan 2.7 documents
asynchronous video APIs, image/reference/video workflows, and materially lower
published per-second pricing in its China region. Public claims are inputs to
the experiment, not a quality conclusion.

Sources:

- [Seedance task API](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh)
- [Seedance pricing](https://docs.volcengine.com/docs/ark/model-pricing?lang=zh)
- [Wan video generation](https://help.aliyun.com/zh/model-studio/use-video-generation/)
- [Wan pricing](https://help.aliyun.com/zh/model-studio/model-pricing)

## Adapter Contract

`packages/domain` owns a versioned, vendor-neutral request and capability
contract. `packages/providers/<provider>` owns SDK calls, raw payload mapping,
authentication, response normalization, pricing mapping, and error mapping.

The common contract must express capabilities instead of pretending every
provider has the same controls:

- allowed aspect ratios, durations, and resolutions;
- first frame, last frame, reference image/video/audio support and limits;
- native audio, video editing, extension, callback, cancellation support;
- provider-specific options validated by the adapter's Zod schema.

The Studio asks the adapter capability registry whether a requested shot is
valid before submitting it. Unsupported requests are rejected with an explicit
reason; they are never silently downscaled, cropped, or routed elsewhere.

## Batches

### A. Generation contract and reference asset semantics

1. Extend the standard aspect-ratio contract to `9:16`, `16:9`, `21:9`,
   `4:3`, `3:4`, and `1:1`.
2. Give each shot-reference attachment an explicit role:
   `character_anchor`, `scene_anchor`, `style_reference`, `first_frame`,
   `last_frame`, or `prop_anchor`.
3. Add minimal reusable reference packs for character, scene, and style assets
   only where they remove duplicated attachments.
4. Extend the Studio upload/attachment flow to select and show the role.

Exit gate: a shot can declare a standard delivery ratio and enough typed assets
for provider preflight; all persisted input remains auditable.

### B. Benchmark harness and two adapters

1. Add `wan` and `seedance` adapters behind the existing provider boundary.
2. Build a fixed 10-shot benchmark: close-up, dialogue, turn, prop interaction,
   action, scene change, and first/last-frame continuation.
3. Generate a fixed candidate count per provider with identical source assets.
4. Record provider/model/version, latency, generated seconds, estimate, actual
   cost, technical failures, and anonymized human review.

Exit gate: each completed candidate can be traced from source assets through a
frozen request, provider receipt, private output, and final human decision.

### C. Candidate selection and controlled production

1. Add a candidate set for a shot; default to three candidates, not automatic
   selection.
2. Let a reviewer select one source asset version and record rejection reasons.
3. Poll non-terminal runs through TanStack Query and show costs/limits before
   submission.

Exit gate: `upload references -> submit candidates -> select -> review` works
without a full-page refresh or provider-specific UI leaking into business code.

### D. Media processing and rough-cut export

1. Pin FFmpeg/FFprobe in the worker image.
2. Validate media, create thumbnails/contact sheets, normalize delivery codecs,
   and export a rough cut from approved shots.
3. Defer a full NLE timeline and OpenTimelineIO integration until real editorial
   interchange is requested.

## Benchmark Decision Rule

Choose a default provider only after the same benchmark is run by both
adapters. Compare candidate accept rate, character/scene consistency, shot
adherence, usable-second cost, p50/p95 completion time, and technical failure
rate. Cost is measured per accepted second, not per generated second.

The result may be split by shot type. For example, one provider may be the
default for reference-driven character shots and another for economical draft
generation. Any such policy remains an explicit user choice in the Studio;
automatic runtime routing is out of scope.

## Explicitly Deferred

- self-hosted GPU production, ComfyUI production deployment, or LoRA training;
- automatic provider failover or automatic quality-based selection;
- a full non-linear editor, publishing integration, multi-tenancy, and billing.
