import { SignUp } from "@clerk/nextjs";

/**
 * Sign-up page component.
 *
 * @description Renders the Clerk SignUp component for new user registration.
 * Uses Clerk's pre-built UI with customization options.
 * Supports Coinbase social login when configured in Clerk dashboard.
 *
 * @see https://clerk.com/docs/components/authentication/sign-up
 * @see https://clerk.com/docs/guides/configure/auth-strategies/social-connections/coinbase
 */
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center gradient-bg">
      <SignUp
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
