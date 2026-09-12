import { z } from "zod";

const text = z.string().trim().min(1);
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
