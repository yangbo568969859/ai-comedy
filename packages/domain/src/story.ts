import { z } from "zod";

import { episodeIdSchema, seriesIdSchema, shotIdSchema } from "./ids.js";

/**
 * These records are the editable production plan. They deliberately do not
 * contain execution state or review outcomes, which remain separate evidence.
 */
export const seriesPlanSchema = z.object({
  id: seriesIdSchema,
  title: z.string().min(1).max(512),
  logline: z.string().max(20_000).optional(),
});
export type SeriesPlan = z.infer<typeof seriesPlanSchema>;

export const episodePlanSchema = z.object({
  id: episodeIdSchema,
  seriesId: seriesIdSchema,
  sequence: z.number().int().positive(),
  title: z.string().min(1).max(512),
  synopsis: z.string().max(20_000).optional(),
});
export type EpisodePlan = z.infer<typeof episodePlanSchema>;

export const shotPlanSchema = z.object({
  id: shotIdSchema,
  episodeId: episodeIdSchema,
  sequence: z.number().int().positive(),
  title: z.string().min(1).max(512),
  script: z.string().min(1).max(20_000),
  visualPrompt: z.string().max(20_000).optional(),
  durationSec: z.number().int().positive().max(60),
});
export type ShotPlan = z.infer<typeof shotPlanSchema>;
