import { z } from "zod";

export const loginSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});