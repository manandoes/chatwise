// Stopping a campaign that is on its way out.
//
// The one thing worth knowing: this cannot un-send anything. Messages already
// delivered stay delivered; what it does is make sure nobody else on the list
// is messaged. That distinction is on the screen too, so nobody presses this
// expecting to recall a message.

import { cancelCampaign } from "@/campaigns/send-campaign";
import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const { id } = await context.params;
    const stopped = await cancelCampaign(found.businessId, id);

    if (!stopped) {
      return apiError(
        "That campaign has already finished, or doesn't exist.",
        "NOT_FOUND",
        404,
      );
    }

    return Response.json({ cancelled: true });
  } catch (error) {
    return unexpectedError("campaigns/cancel", error);
  }
}
