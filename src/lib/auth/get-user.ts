import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";

/**
 * User session data structure.
 *
 * @description Contains the authenticated user's information
 * extracted from the Clerk session.
 */
export type AuthSession = {
  /** The Clerk user ID (stable, unique identifier). */
  userId: string;
  /** The user's primary email address. */
  email: string | undefined;
  /** The user's display name or first name. */
  name: string | undefined;
  /** The user's profile image URL. */
  imageUrl: string | undefined;
};

/**
 * Error thrown when authentication is required but not present.
 */
export class AuthenticationError extends Error {
  constructor(message: string = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Get the current authenticated user's session.
 *
 * @description Retrieves the authenticated user's information from Clerk.
 * Returns null if not authenticated (does not throw).
 *
 * @returns The user session data or null if not authenticated.
 *
 * @example
 * ```typescript
 * const session = await getAuthSession();
 * if (session) {
 *   console.log(`Hello, ${session.name}`);
 * }
 * ```
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const user = await currentUser();

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.primaryEmailAddress?.emailAddress,
    name: user.firstName ?? user.username ?? undefined,
    imageUrl: user.imageUrl,
  };
}

/**
 * Get the current authenticated user or throw an error.
 *
 * @description Retrieves the authenticated user's information from Clerk.
 * Throws an AuthenticationError if not authenticated.
 *
 * @throws {AuthenticationError} When user is not authenticated.
 * @returns The user session data.
 *
 * @example
 * ```typescript
 * // In a protected API route
 * const session = await requireAuthSession();
 * // session is guaranteed to be non-null here
 * ```
 */
export async function requireAuthSession(): Promise<AuthSession> {
  const session = await getAuthSession();

  if (!session) {
    throw new AuthenticationError();
  }

  return session;
}

/**
 * Get the full Clerk user object.
 *
 * @description Retrieves the complete Clerk user object with all metadata.
 * Returns null if not authenticated.
 *
 * @returns The full Clerk User object or null.
 */
export async function getClerkUser(): Promise<User | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  return await currentUser();
}

/**
 * Check if the current request is authenticated.
 *
 * @description Quick check for authentication status without fetching user data.
 *
 * @returns True if authenticated, false otherwise.
 */
export async function isAuthenticated(): Promise<boolean> {
  const { userId } = await auth();
  return userId !== null;
}
