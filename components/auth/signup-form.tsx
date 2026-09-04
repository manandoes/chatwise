"use client";

// Creating an account. Two steps happen behind one button press: the account is
// created, then the person is signed straight in — they shouldn't have to type
// their password twice in a row.

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
  MIN_PASSWORD_LENGTH,
  isValid,
  validateSignUp,
  type ValidationErrors,
} from "@/lib/validation/auth";

export function SignUpForm({
  next,
  isGoogleEnabled,
}: {
  next: string;
  isGoogleEnabled: boolean;
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError(null);

    // A quick check here saves a round trip. The server checks again regardless.
    const errors = validateSignUp({ name, email, password });
    setFieldErrors(errors);
    if (!isValid(errors)) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        setFieldErrors(body?.error?.fields ?? {});
        setFormError(
          body?.error?.message ??
            "We couldn't create your account. Please try again.",
        );
        setIsSubmitting(false);
        return;
      }

      // Account created — now sign them in with the details they just gave us.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setFormError(
          "Your account was created, but we couldn't sign you in. Please log in.",
        );
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
        id="name"
        label="Your name"
        type="text"
        autoComplete="name"
        placeholder="Priya Sharma"
        value={name}
        error={fieldErrors.name}
        onChange={(event) => setName(event.target.value)}
        disabled={isSubmitting}
      />

      <Field
        id="email"
        label="Work email"
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
        autoComplete="new-password"
        placeholder="At least 8 characters"
        hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={isSubmitting}
      />

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating your account…" : "Create account"}
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
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
