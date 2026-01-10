import { z } from "zod";

/**
 * Environment variable schema for server-side configuration.
 *
 * @description Validates all required environment variables at startup.
 * Server-side variables are never exposed to the client.
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
 * @see https://clerk.com/docs/deployments/clerk-environment-variables
 */
const serverEnvSchema = z.object({
  /** MongoDB Atlas connection string. */
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  /** Clerk secret key for server-side authentication. */
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),

  /** Coinbase CDP API Key ID for Server Wallet v2. */
  CDP_API_KEY_ID: z.string().min(1, "CDP_API_KEY_ID is required"),

  /** Coinbase CDP API Key Secret for Server Wallet v2. */
  CDP_API_KEY_SECRET: z.string().min(1, "CDP_API_KEY_SECRET is required"),

  /** Coinbase CDP Wallet Secret for signing transactions. */
  CDP_WALLET_SECRET: z.string().min(1, "CDP_WALLET_SECRET is required"),

  /** Fireworks AI API key for LLM and ASR. */
  FIREWORKS_API_KEY: z.string().min(1, "FIREWORKS_API_KEY is required"),

  /** VoyageAI API key for embeddings (optional but recommended). */
  VOYAGE_API_KEY: z.string().optional(),

  /** Galileo API key for observability (optional but recommended). */
  GALILEO_API_KEY: z.string().optional(),

  /** Galileo project name for observability (optional but recommended). */
  GALILEO_PROJECT: z.string().optional(),

  /** Galileo log stream name for observability (optional but recommended). */
  GALILEO_LOG_STREAM: z.string().optional(),

  /** Secret for authenticating Vercel Cron requests. */
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),

  /** Node environment. */
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

/**
 * Environment variable schema for client-side configuration.
 *
 * @description These variables are exposed to the client via NEXT_PUBLIC_ prefix.
 * Only include non-sensitive configuration here.
 */
const clientEnvSchema = z.object({
  /** Clerk publishable key for client-side authentication. */
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),

  /** Sign-in URL for Clerk. */
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),

  /** Sign-up URL for Clerk. */
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),

  /** After sign-in redirect URL. */
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().default("/"),

  /** After sign-up redirect URL. */
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().default("/"),
});

/**
 * Type definition for server environment variables.
 */
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Type definition for client environment variables.
 */
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Validates and returns server-side environment variables.
 *
 * @description Call this function to get typed access to server environment variables.
 * Throws a detailed error if any required variables are missing or invalid.
 *
 * @throws {Error} When validation fails with detailed error messages.
 * @returns Validated server environment variables.
 *
 * @example
 * ```typescript
 * const env = getServerEnv();
 * const mongoUri = env.MONGODB_URI;
 * ```
 */
export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, value]) => {
        const errorMessages =
          value && typeof value === "object" && "_errors" in value
            ? (value._errors as string[])
            : [];
        return `  ${key}: ${errorMessages.join(", ")}`;
      })
      .join("\n");

    throw new Error(
      `Environment validation failed:\n${errors}\n\nPlease check your .env.local file.`
    );
  }

  return result.data;
}

/**
 * Validates and returns client-side environment variables.
 *
 * @description Safe to call on both server and client.
 * These variables are already exposed via NEXT_PUBLIC_ prefix.
 *
 * @throws {Error} When validation fails.
 * @returns Validated client environment variables.
 */
export function getClientEnv(): ClientEnv {
  const clientEnv = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:
      process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:
      process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
  };

  const result = clientEnvSchema.safeParse(clientEnv);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, value]) => {
        const errorMessages =
          value && typeof value === "object" && "_errors" in value
            ? (value._errors as string[])
            : [];
        return `  ${key}: ${errorMessages.join(", ")}`;
      })
      .join("\n");

    throw new Error(`Client environment validation failed:\n${errors}`);
  }

  return result.data;
}

/**
 * Cached server environment instance.
 * Lazily initialized on first access.
 */
let cachedServerEnv: ServerEnv | undefined;

/**
 * Get cached server environment variables.
 *
 * @description Returns cached environment variables for performance.
 * First call will validate and cache the environment.
 *
 * @returns Cached server environment variables.
 */
export function env(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = getServerEnv();
  }
  return cachedServerEnv;
}
