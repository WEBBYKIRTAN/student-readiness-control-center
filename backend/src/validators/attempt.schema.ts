import { z } from "zod";

export const createAttemptSchema = z.object({
  competencyId: z.string().uuid(),

  score: z
    .number()
    .min(0)
    .max(100),

  submittedAt: z
    .string()
    .datetime()
    .optional(),
});

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;