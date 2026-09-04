// Finding the signed-in customer's WhatsApp connection, safely.
//
// Every WhatsApp route starts here. The connection is looked up from the
// session's user id — never from an id in the request — so one customer can
// never reach another's connection (docs/Rules.md §3).

import "server-only";

import { apiError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { getOrCreateBusiness } from "@/lib/onboarding";

type Found = {
  ok: true;
  businessId: string;
  connection: {
    id: string;
    type: "QR" | "API";
    status: string;
    phoneNumber: string | null;
    messagesReceived: number;
    messagesSent: number;
    lastMessageAt: Date | null;
    lastError: string | null;
  };
};

type Refused = { ok: false; response: Response };

/** Same as `requireQrConnection`, but for accounts on the official API. */
export async function requireApiConnection(): Promise<Found | Refused> {
  const found = await requireConnection();
  if (!found.ok) return found;

  if (found.connection.type !== "API") {
    return {
      ok: false,
      response: apiError(
        "Your account uses the free QR connection, not the WhatsApp Business API.",
        "NOT_AUTHORIZED",
        409,
      ),
    };
  }

  return found;
}

/**
 * Returns the customer's QR connection, or the response to send back instead.
 *
 * Refuses when: nobody is signed in, setup isn't finished, or the account is on
 * the official API rather than the QR connection — an account is one or the
 * other, never both (docs/PRD.md §3.1).
 */
export async function requireQrConnection(): Promise<Found | Refused> {
  const found = await requireConnection();
  if (!found.ok) return found;

  if (found.connection.type !== "QR") {
    return {
      ok: false,
      response: apiError(
        "Your account uses the official WhatsApp Business API, not a QR connection.",
        "NOT_AUTHORIZED",
        409,
      ),
    };
  }

  return found;
}

/** The signed-in customer's connection, whichever type it is. */
async function requireConnection(): Promise<Found | Refused> {
  const user = await getApiUser();

  if (!user) {
    return {
      ok: false,
      response: apiError(
        "Please log in and try again.",
        "NOT_AUTHENTICATED",
        401,
      ),
    };
  }

  const business = await getOrCreateBusiness(user.id);

  if (!business.connection) {
    return {
      ok: false,
      response: apiError(
        "You haven't chosen how to connect WhatsApp yet.",
        "NOT_FOUND",
        404,
      ),
    };
  }

  return {
    ok: true,
    businessId: business.id,
    connection: business.connection,
  };
}
