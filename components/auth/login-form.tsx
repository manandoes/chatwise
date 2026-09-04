"use client";

// Logging back in.

import { AlertCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field } from "@/components/auth/field";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  isValid,
  validateSignIn,
  type ValidationErrors,
} from "@/lib/validation/auth";

/**
 * Turns NextAuth's error names into something a person can act on.
 *
 * Note that a wrong password and an email with no account give the *same*
 * message on purpose — saying "no account with that email" would let anyone
 * check which email addresses are registered here.
 */
function messageForError(error: string): string {
  switch (error) {
    case "CredentialsSignin":
      return "That email and password don't match. Check them and try again.";
    case "OAuthAccountNotLinked":
      return "That email is already registered with a password. Log in with your password instead.";
    case "AccessDenied":
      return "That account isn't allowed to sign in.";
    default:
      return "Something went wrong signing you in. Please try again.";
  }
}

export function LoginForm({
  next,
  isGoogleEnabled,
  initialError,
}: {
  next: string;
  isGoogleEnabled: boolean;
  /** An error NextAuth passed back in the URL, e.g. after a failed Google sign-in. */
  initialError?: string;
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(
    initialError ? messageForError(initialError) : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError(null);

    const errors = validateSignIn({ email, password });
    setFieldErrors(errors);
    if (!isValid(errors)) return;

    setIsSubmitting(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setFormError(messageForError(result.error));
        setIsSubmitting(false);
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setFormError(
        "We couldn't reach ChatWise. Check your connection and try again.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@yourbusiness.com"
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={isSubmitting}
      />

      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={isSubmitting}
      />

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Logging you in…" : "Log in"}
      </Button>

      {isGoogleEnabled && (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-small text-text-secondary">or</span>
            <Separator className="flex-1" />
          </div>

          <GoogleSignInButton next={next} disabled={isSubmitting} />
        </>
      )}

      <p className="text-center text-small text-text-secondary">
        New to ChatWise?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
