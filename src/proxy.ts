import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Route matchers for authentication protection.
 *
 * @description Defines which routes should be protected by Clerk authentication.
 * Public routes are accessible without authentication.
 * Protected routes require a valid Clerk session.
 */

/**
 * Public routes that do not require authentication.
 * Includes landing page, auth pages, API webhooks, and cron endpoints.
 */
const isPublicRoute = createRouteMatcher([
  "/",              // Landing page
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",  // Cron jobs use their own authentication
]);

/**
 * Clerk middleware for authentication.
 *
 * @description Protects all routes except those marked as public.
 * Uses Clerk's built-in session management and JWT verification.
 *
 * @see https://clerk.com/docs/references/nextjs/clerk-middleware
 */
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

/**
 * Middleware configuration.
 *
 * @description Specifies which routes the middleware should run on.
 * Excludes static files, images, and Next.js internals for performance.
 */
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
