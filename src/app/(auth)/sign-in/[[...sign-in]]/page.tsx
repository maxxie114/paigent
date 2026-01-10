import { SignIn } from "@clerk/nextjs";

/**
 * Sign-in page component.
 *
 * @description Renders the Clerk SignIn component for user authentication.
 * Uses Clerk's pre-built UI with customization options.
 * Supports Coinbase social login when configured in Clerk dashboard.
 *
 * @see https://clerk.com/docs/components/authentication/sign-in
 * @see https://clerk.com/docs/guides/configure/auth-strategies/social-connections/coinbase
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center gradient-bg">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-card border border-border shadow-xl",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton:
              "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            formButtonPrimary:
              "bg-primary text-primary-foreground hover:bg-primary/90",
            formFieldInput: "bg-input border-border text-foreground",
            formFieldLabel: "text-muted-foreground",
            footerActionLink: "text-primary hover:text-primary/80",
          },
        }}
      />
    </div>
  );
}
