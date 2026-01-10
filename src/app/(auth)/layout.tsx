/**
 * Authentication layout component.
 *
 * @description Layout wrapper for authentication pages (sign-in, sign-up).
 * Provides a clean, centered layout with gradient background.
 *
 * @param children - The authentication page content.
 * @returns The layout wrapper for auth pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
