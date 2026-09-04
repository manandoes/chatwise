// One consistent shape for everything the API sends back, so the screens never
// have to guess how to read a response (docs/Rules.md §4).
//
// Success:  { ...whatever the route returns }
// Failure:  { error: { message, code, fields? } }
//
// `message` is written for a person to read on screen. `code` is for the app to
// branch on. `fields` marks individual form boxes that need fixing.

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_CREDENTIALS"
  | "NOT_AUTHENTICATED"
  | "NOT_AUTHORIZED"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "RATE_LIMITED"
  | "DATABASE_UNAVAILABLE"
  | "UNEXPECTED_ERROR";

export type ApiErrorBody = {
  error: {
    message: string;
    code: ApiErrorCode;
    fields?: Record<string, string>;
  };
};

export function apiError(
  message: string,
  code: ApiErrorCode,
  status: number,
  fields?: Record<string, string>,
): Response {
  const body: ApiErrorBody = { error: { message, code, ...(fields && { fields }) } };

  return Response.json(body, { status });
}

/**
 * The catch-all for anything we didn't anticipate. The real error goes to the
 * server log for developers; the person on screen gets a plain sentence and
 * never a stack trace (docs/Rules.md §4).
 */
export function unexpectedError(context: string, error: unknown): Response {
  console.error(`[${context}]`, error);

  return apiError(
    "Something went wrong on our end. Please try again in a moment.",
    "UNEXPECTED_ERROR",
    500,
  );
}
