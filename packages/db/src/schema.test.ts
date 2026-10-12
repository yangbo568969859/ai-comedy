import { describe, expect, it } from "vitest";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  assetReviews,
  assets,
  benchmarkCandidates,
  benchmarkCases,
  benchmarkEvaluations,
  benchmarkSuites,
  costLedgerEntries,
  generationRunEvents,
  generationRuns,
  episodes,
  episodeExports,
  episodeCompositionTaskEvents,
  episodeCompositionTasks,
  referencePackAssets,
  referencePackKindEnum,
  referencePacks,
  series,
  shotReferenceAssets,
  shotReferenceRoleEnum,
  shotReferencePacks,
  shots,
} from "./schema.js";

describe("core persistence schema", () => {
  it("keeps generation execution state in append-only events", () => {
    const runColumns = getTableConfig(generationRuns).columns.map((column) => column.name);
    const eventColumns = getTableConfig(generationRunEvents).columns.map((column) => column.name);

    expect(runColumns).toContain("request_snapshot");
    expect(runColumns).not.toContain("status");
    expect(eventColumns).toEqual(expect.arrayContaining(["run_id", "sequence", "from_status", "to_status"]));
  });

  it("models an editable series, episode, and shot production plan", () => {
    expect(getTableConfig(series).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["title", "logline", "updated_at"]),
    );
    expect(getTableConfig(episodes).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["series_id", "sequence", "synopsis"]),
    );
    expect(getTableConfig(shots).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["episode_id", "script", "visual_prompt", "duration_sec"]),
    );
  });

  it("links reference assets and generation runs to a shot without copying media", () => {
    expect(getTableConfig(shotReferenceAssets).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["shot_id", "asset_id", "role", "sequence", "attached_by"]),
    );
    expect(getTableConfig(generationRuns).columns.map((column) => column.name)).toContain("shot_id");
  });

  it("reuses series-scoped character, scene, and style packs across shots", () => {
    expect(referencePackKindEnum.enumValues).toEqual(["character", "scene", "style"]);
    expect(getTableConfig(referencePacks).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["series_id", "kind", "name"]),
    );
    expect(getTableConfig(referencePackAssets).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["reference_pack_id", "asset_id", "sequence"]),
    );
    expect(getTableConfig(shotReferencePacks).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["shot_id", "reference_pack_id", "sequence"]),
    );
  });

  it("keeps explicit provider-ready roles for direct shot references", () => {
    expect(shotReferenceRoleEnum.enumValues).toEqual([
      "character_anchor",
      "scene_anchor",
      "style_reference",
      "first_frame",
      "last_frame",
      "prop_anchor",
    ]);
  });

  it("keeps asset, review, and cost evidence independently linked to a run", () => {
    expect(getTableConfig(assets).columns.map((column) => column.name)).toContain("sha256");
    expect(getTableConfig(assetReviews).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["content_decision", "rights_decision", "labeling_decision"]),
    );
    expect(getTableConfig(costLedgerEntries).columns.map((column) => column.name)).toContain(
      "amount_minor_units",
    );
  });

  it("records private episode masters with immutable ordered input provenance", () => {
    expect(getTableConfig(episodeExports).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["episode_id", "output_asset_id", "input_asset_ids", "created_by", "created_at"]),
    );
  });

  it("keeps private rough-cut execution state in append-only task events", () => {
    expect(getTableConfig(episodeCompositionTasks).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["export_id", "episode_id", "input_asset_ids", "requested_by", "requested_at"]),
    );
    expect(getTableConfig(episodeCompositionTasks).columns.map((column) => column.name)).not.toContain("status");
    expect(getTableConfig(episodeCompositionTaskEvents).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["task_id", "sequence", "from_status", "to_status", "reason_code"]),
    );
  });
  it("keeps provider experiments, opaque candidates, and append-only human scores separate", () => {
    expect(getTableConfig(benchmarkSuites).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["series_id", "version", "name"]),
    );
    expect(getTableConfig(benchmarkCases).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["suite_id", "code", "category", "expected_candidate_count"]),
    );
    expect(getTableConfig(benchmarkCandidates).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["case_id", "run_id", "blind_label"]),
    );
    expect(getTableConfig(benchmarkEvaluations).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["candidate_id", "identity_consistency", "motion_quality", "decision"]),
    );
  });
});
