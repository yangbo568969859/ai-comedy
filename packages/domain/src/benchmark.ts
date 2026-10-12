import { z } from "zod";

import { contractVersion, isoUtcSchema, runIdSchema, seriesIdSchema } from "./ids.js";

export const benchmarkSuiteIdSchema = z.string().uuid();
export const benchmarkCaseIdSchema = z.string().uuid();
export const benchmarkCandidateIdSchema = z.string().uuid();
export const benchmarkEvaluationIdSchema = z.string().uuid();

export const benchmarkCaseCategorySchema = z.enum([
  "portrait",
  "dialogue",
  "turn",
  "prop_interaction",
  "action",
  "scene_transition",
  "first_last_frame",
]);
export type BenchmarkCaseCategory = z.infer<typeof benchmarkCaseCategorySchema>;

export const benchmarkEvaluationDecisionSchema = z.enum(["accepted", "rejected", "needs_changes"]);
export type BenchmarkEvaluationDecision = z.infer<typeof benchmarkEvaluationDecisionSchema>;

const fivePointScoreSchema = z.number().int().min(1).max(5);

/**
 * Human scores intentionally capture production usefulness, not a model's
 * subjective artistic merit. They are advisory evidence and never release
 * an asset without the separate content, rights, and labeling review.
 */
export const benchmarkEvaluationSchema = z.object({
  contractVersion: z.literal(contractVersion),
  evaluationId: benchmarkEvaluationIdSchema,
  candidateId: benchmarkCandidateIdSchema,
  decision: benchmarkEvaluationDecisionSchema,
  identityConsistency: fivePointScoreSchema,
  sceneConsistency: fivePointScoreSchema,
  shotAdherence: fivePointScoreSchema,
  motionQuality: fivePointScoreSchema,
  technicalQuality: fivePointScoreSchema,
  evaluatedBy: z.string().min(1).max(256),
  evaluatedAt: isoUtcSchema,
  note: z.string().max(4_000).optional(),
});
export type BenchmarkEvaluation = z.infer<typeof benchmarkEvaluationSchema>;

export const benchmarkSuiteDefinitionSchema = z.object({
  contractVersion: z.literal(contractVersion),
  suiteId: benchmarkSuiteIdSchema,
  seriesId: seriesIdSchema,
  version: z.string().min(1).max(128),
  name: z.string().min(1).max(512),
  cases: z.array(z.object({
    caseId: benchmarkCaseIdSchema,
    sequence: z.number().int().positive(),
    code: z.string().regex(/^B\d{2}$/),
    category: benchmarkCaseCategorySchema,
    title: z.string().min(1).max(512),
    prompt: z.string().min(1).max(20_000),
    expectedCandidateCount: z.number().int().min(1).max(10),
  })).length(10),
});
export type BenchmarkSuiteDefinition = z.infer<typeof benchmarkSuiteDefinitionSchema>;

export const benchmarkCandidateSchema = z.object({
  contractVersion: z.literal(contractVersion),
  candidateId: benchmarkCandidateIdSchema,
  caseId: benchmarkCaseIdSchema,
  runId: runIdSchema,
  candidateSequence: z.number().int().positive(),
  blindLabel: z.string().regex(/^C\d{2}$/),
  createdAt: isoUtcSchema,
});
export type BenchmarkCandidate = z.infer<typeof benchmarkCandidateSchema>;

