import { z } from "zod";

const text = z.string().trim().min(1);
export const provenanceSchema = z.object({
  coordinator_id: text,
  dispatched_challenger_ids: z.array(text).min(1),
}).strict().superRefine((value, ctx) => {
  if (value.dispatched_challenger_ids.includes(value.coordinator_id)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Challenger dispatch ID cannot be the coordinator ID." });
  }
});
export const categorySchema = z.enum(["correctness", "security", "performance", "architecture", "tests"]);
export const rootCauseSchema = z.object({
  symbol: text,
  mechanism: text,
  invariant: text,
}).strict();

export const reconciliationSchema = z.array(z.object({
  canonical_id: text,
  members: z.array(z.object({ finding_id: text, category: categorySchema }).strict()).min(1),
  rootCause: rootCauseSchema,
  reasoning: text,
  claims_reviewed: z.literal(true),
  causal_analysis: text.optional(),
  claim_coverage: z.array(z.object({
    finding_id: text,
    source_claim: text,
    description_excerpt: text,
    evidence_excerpt: text,
    impact_excerpt: text,
    observation_excerpt: text.optional(),
  }).strict()).optional(),
  baseline_match: z.object({ finding_id: text, reasoning: text }).strict().optional(),
  incorporated_baselines: z.array(z.object({
    finding_id: text,
    reasoning: text,
    covered_claims: z.array(text).min(1),
  }).strict()).optional(),
}).strict());

/** Complete replacement of claim-bearing content, not a partial cosmetic edit. */
export const findingCorrectionSchema = z.object({
  reason: text,
  title: text,
  description: text,
  evidence: z.array(text).min(1),
  impact: text,
  scenario: text.nullable().optional(),
  recommendation: text.nullable().optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
}).strict();
export const baselineQuerySchema = z.object({
  file: z.string().trim().min(1).optional(),
  symbol: z.string().trim().min(1).optional(),
  finding_id: z.string().trim().min(1).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();
