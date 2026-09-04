"use client";

// "Continue with Google". Handles both signing up and logging in — Google
// doesn't distinguish, and neither do we.

import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function GoogleSignInButton({
  next,
  disabled,
}: {
  /** Where to land after Google sends the person back. */
  next: string;
  disabled?: boolean;
}) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={disabled || isRedirecting}
      onClick={() => {
        setIsRedirecting(true);
        void signIn("google", { redirectTo: next });
      }}
    >
      <GoogleLogo />
      {isRedirecting ? "Taking you to Google…" : "Continue with Google"}
    </Button>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.63l4.01 3.09C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}
