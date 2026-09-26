// Disconnects the account's Shopify store. Owner only.
//
// The token is revoked with Shopify and wiped here, and everything queued for
// the store is cancelled. Contacts, orders and products stay: they are the
// business's own customer history.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { disconnectShop } from "@/integrations/shopify/connect";

export async function POST() {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const disconnected = await disconnectShop(found.businessId);

    if (!disconnected) return apiError("No Shopify store is connected.", "NOT_FOUND", 404);

    return Response.json({ disconnected: true });
  } catch (error) {
    return unexpectedError("shopify/disconnect", error);
  }
}
