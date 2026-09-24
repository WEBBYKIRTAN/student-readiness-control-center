import { z } from "zod";

export const updateStudentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(254).optional(),
  version: z.number().int().min(1),
});

export type UpdateStudentInput = z.infer<
  typeof updateStudentSchema
>;