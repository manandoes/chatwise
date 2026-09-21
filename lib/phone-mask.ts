// Masking a contact's number on screen (Settings → Privacy).
//
// Nothing server-only here — the inbox list renders on the server and the
// live thread re-draws in the browser, and both need the same masking.

/** "+919876543210" → "+9198••••10". Keeps enough to recognise a repeat
 * customer without showing the whole number. Short numbers are masked less
 * aggressively so there's still something left to show. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length <= 4) return "•".repeat(digits.length);

  const head = digits.slice(0, Math.min(4, digits.length - 2));
  const tail = digits.slice(-2);
  const middle = "•".repeat(Math.max(2, digits.length - head.length - tail.length));

  return `+${head}${middle}${tail}`;
}
