import "dotenv/config";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not defined");
}

const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "15m";

export const env = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret,
  jwtExpiresIn,
} as const;