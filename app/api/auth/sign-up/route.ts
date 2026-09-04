// Creating a new ChatWise account with an email address and a password.
//
// (Signing in afterwards is handled by NextAuth — see lib/auth.ts. This route
// only creates the account.)

import { apiError, unexpectedError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  isValid,
  normalizeEmail,
  validateSignUp,
  type SignUpInput,
} from "@/lib/validation/auth";

export async function POST(request: Request) {
  try {
    let body: Partial<SignUpInput>;
    try {
      body = await request.json();
    } catch {
      return apiError(
        "We couldn't read that request. Please try again.",
        "VALIDATION_FAILED",
        400,
      );
    }

    const input: SignUpInput = {
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
    };

    // The browser checks these too, but the server never trusts that.
    const errors = validateSignUp(input);
    if (!isValid(errors)) {
      return apiError(
        "Please check the highlighted boxes.",
        "VALIDATION_FAILED",
        400,
        errors,
      );
    }

    const email = normalizeEmail(input.email);
    const name = input.name.trim();

    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return apiError(
        "There's already an account with that email address. Try logging in instead.",
        "EMAIL_ALREADY_REGISTERED",
        409,
        { email: "This email is already registered." },
      );
    }

    const user = await db.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(input.password),
      },
      select: { id: true, email: true, name: true },
    });

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    // Two sign-ups with the same email at the same moment: the unique index on
    // the email column is what actually guarantees only one wins.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return apiError(
        "There's already an account with that email address. Try logging in instead.",
        "EMAIL_ALREADY_REGISTERED",
        409,
        { email: "This email is already registered." },
      );
    }

    return unexpectedError("auth/sign-up", error);
  }
}
