import { z } from "zod";

const text = z.string().trim().min(1);
export const evidencePackageSchema = z.object({
  schemaVersion: z.literal(1),
  revision: text,
  workingTree: z.enum(["clean", "dirty", "unknown"]),
  method: z.enum(["static-analysis", "test", "reproduction"]),
  executionPath: z.array(text).min(1),
  preconditions: z.array(text),
  expected: text,
  observed: text,
  limitations: z.array(text),
  command: text.optional(),
  artifact: text.optional(),
  negativeControl: z.object({ scenario: text, observed: text }).strict().optional(),
}).strict().superRefine((packet, ctx) => {
  if (packet.method !== "static-analysis" && (!packet.command || !packet.artifact)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom,
      message: "Executed validation requires the command and a recorded result/artifact." });
  }
});
