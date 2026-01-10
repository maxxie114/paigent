import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { getClientEnv } from "@/lib/env";
import "./globals.css";

/**
 * Font configuration for Geist Sans.
 * Used as the primary UI font throughout the application.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * Font configuration for Geist Mono.
 * Used for code, technical content, and monospace text.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Application metadata for SEO and social sharing.
 */
export const metadata: Metadata = {
  title: "Paigent Studio | Agentic Workflow Orchestration",
  description:
    "A workflow IDE where users speak or type an outcome, and a multi-agent system designs and executes a long-running, resumable tool-chain with x402 micropayments.",
  keywords: [
    "AI agents",
    "workflow automation",
    "x402 payments",
    "micropayments",
    "USDC",
    "Coinbase",
    "MongoDB",
    "orchestration",
  ],
  authors: [{ name: "Paigent Studio" }],
  openGraph: {
    title: "Paigent Studio | Agentic Workflow Orchestration",
    description:
      "Design and execute long-running, resumable workflows with AI agents and x402 micropayments.",
    type: "website",
  },
};

/**
 * Root layout component for the entire application.
 *
 * @description Provides global providers and configuration:
 * - ClerkProvider for authentication
 * - Font variables for consistent typography
 * - Dark mode as default theme
 * - Sonner for toast notifications
 *
 * @param children - The page content to render.
 * @returns The root HTML structure with all providers.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_PROXY_URL,
    NEXT_PUBLIC_CLERK_FRONTEND_API,
    NEXT_PUBLIC_CLERK_JS_SCRIPT_URL,
    NEXT_PUBLIC_CLERK_USE_PROXY,
  } = getClientEnv();

  const clerkJsUrl = resolveClerkJsUrl(
    NEXT_PUBLIC_CLERK_FRONTEND_API,
    NEXT_PUBLIC_CLERK_JS_SCRIPT_URL
  );

  const shouldUseProxy =
    NEXT_PUBLIC_CLERK_USE_PROXY?.toLowerCase() === "true" &&
    !!NEXT_PUBLIC_CLERK_PROXY_URL;

  const clerkProviderProps = {
    publishableKey: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    signInUrl: NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    signUpUrl: NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    afterSignInUrl: NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
    afterSignUpUrl: NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
    ...(shouldUseProxy
      ? { proxyUrl: NEXT_PUBLIC_CLERK_PROXY_URL }
      : {}),
    ...(clerkJsUrl ? { clerkJSUrl: clerkJsUrl } : {}),
  } as const;

  return (
    <ClerkProvider
      {...clerkProviderProps}
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: "hsl(195, 80%, 50%)",
          colorBackground: "hsl(250, 20%, 12%)",
          colorText: "hsl(240, 10%, 95%)",
          colorInputBackground: "hsl(250, 20%, 16%)",
          colorInputText: "hsl(240, 10%, 95%)",
        },
      }}
    >
      <html lang="en" className="dark">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
        >
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "bg-card border-border",
                title: "text-foreground",
                description: "text-muted-foreground",
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}

function resolveClerkJsUrl(
  frontendApi?: string,
  override?: string
): string | undefined {
  if (override && override.trim().length > 0) {
    return override;
  }

  if (!frontendApi) {
    return undefined;
  }

  const sanitized = frontendApi
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .trim();

  if (sanitized.length === 0) {
    return undefined;
  }

  return `https://${sanitized}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
}
