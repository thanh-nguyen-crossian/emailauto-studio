import { z } from "zod";

const providerSchema = z.enum(["claude", "gemini", "openai"]);

const modelSelectionSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1).max(160),
});

const productSchema = z.object({
  name: z.string().max(160).optional(),
  slug: z.string().max(160).optional(),
  price: z.string().max(80).optional(),
  url: z.string().max(800).optional(),
  review: z.string().max(500).optional(),
  usps: z.array(z.string().max(180)).max(12).optional(),
  hero: z.boolean().optional(),
  segment: z.string().max(80).optional(),
}).passthrough();

export const promptOverridesSchema = z.object({
  system: z.string().max(12_000).optional(),
  user: z.string().max(12_000).optional(),
  segments: z.record(z.string().max(40), z.string().max(1_200)).optional(),
}).passthrough();

export const generateCopyBodySchema = z.object({
  brandId: z.string().trim().min(1).max(80),
  sendDate: z.string().trim().max(40).optional(),
  segments: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  products: z.array(productSchema).max(8).optional(),
  promptOverrides: promptOverridesSchema.optional(),
  models: z.object({
    a: modelSelectionSchema.optional(),
    b: modelSelectionSchema.optional(),
  }).partial().optional(),
  stream: z.boolean().optional(),
  feedback: z.string().max(4_000).optional(),
  existingOptions: z.unknown().optional(),
}).passthrough();

export type GenerateCopyBody = z.infer<typeof generateCopyBodySchema>;

export function zodIssueSummary(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "body";
    return `${path}: ${issue.message}`;
  });
}

