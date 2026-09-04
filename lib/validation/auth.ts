// Checks on what someone typed into the sign-up and log-in forms.
//
// Every message here is shown directly to a person, so they are written in
// plain English and say what to do next, not what rule was broken
// (docs/Rules.md §7).
//
// The same functions run on the server as well as in the browser. The browser
// check is only there to give quick feedback — the server never trusts it.

/** Shortest password we accept. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Very long passwords make each check slow enough to become a way of attacking
 * the server, so the length is capped.
 */
export const MAX_PASSWORD_LENGTH = 200;

export type ValidationErrors = Record<string, string>;

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

/**
 * Deliberately permissive. Email addresses in the wild are far stranger than
 * most patterns allow, and the real proof that an address works is that mail
 * sent to it arrives — not that it matched a clever regular expression.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

/** Trims spaces and lower-cases, so "  Sam@Example.com " and "sam@example.com" are one account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const value = normalizeEmail(email);

  if (!value) return "Enter your email address.";
  if (value.length > MAX_EMAIL_LENGTH) return "That email address is too long.";
  if (!EMAIL_PATTERN.test(value)) {
    return "That doesn't look like an email address. Check for typos.";
  }

  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Keep it under ${MAX_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

export function validateName(name: string): string | null {
  const value = name.trim();

  if (!value) return "Enter your name.";
  if (value.length > MAX_NAME_LENGTH) return "That name is too long.";

  return null;
}

/** Checks a whole sign-up form. Returns an empty object when everything is fine. */
export function validateSignUp(input: SignUpInput): ValidationErrors {
  const errors: ValidationErrors = {};

  const nameError = validateName(input.name);
  if (nameError) errors.name = nameError;

  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(input.password);
  if (passwordError) errors.password = passwordError;

  return errors;
}

/**
 * Checks a log-in form. Only checks that both boxes are filled in — telling
 * someone their password is "too short to be right" would confirm the email
 * address exists, which we don't want to reveal.
 */
export function validateSignIn(input: SignInInput): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!normalizeEmail(input.email)) errors.email = "Enter your email address.";
  if (!input.password) errors.password = "Enter your password.";

  return errors;
}

/** True when a validation result has no problems in it. */
export function isValid(errors: ValidationErrors): boolean {
  return Object.keys(errors).length === 0;
}

/**
 * Checks the "where were you heading?" value we carry through the login screen.
 *
 * This comes from the address bar, so anyone can put anything in it. Without
 * this check, a link like `/login?next=https://not-us.example` would bounce
 * someone straight off our site right after they typed their password — the
 * classic setup for a convincing phishing page. Only plain paths on our own
 * site are allowed through; anything else falls back to the dashboard.
 */
export function safeRedirectPath(
  value: string | string[] | undefined,
  fallback = "/dashboard",
): string {
  const path = Array.isArray(value) ? value[0] : value;

  if (!path) return fallback;

  // Must start with a single slash. `//evil.example` and `https://evil.example`
  // are both absolute addresses elsewhere, and `\\` is treated as `//` by some
  // browsers.
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;

  return path;
}
