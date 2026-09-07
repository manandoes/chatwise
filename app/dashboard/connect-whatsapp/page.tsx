// Connect WhatsApp.
//
// An account is either on the QR tier (scan a QR code) or the API tier (the
// official Business API), never both (docs/PRD.md §3.1) — so this screen shows
// whichever applies rather than offering a choice. Both are paid; the API tier
// is the one that also bills the customer at Meta.

import { headers } from "next/headers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApiConnect } from "@/components/dashboard/api-connect";
import { PageHeader } from "@/components/dashboard/page-header";
import { QrConnect } from "@/components/dashboard/qr-connect";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { describeCredentials } from "@/whatsapp-connectors/business-api/credentials";
import { renderQrCode } from "@/whatsapp-connectors/web-qr/qr-generator";
import {
  isQueueReachable,
  readLiveState,
} from "@/whatsapp-connectors/web-qr/session-commands";

export const metadata: Metadata = { title: "Connect WhatsApp" };

/**
 * Where this app is reachable, used to build each customer's own webhook
 * address.
 *
 * Taken from the request rather than hardcoded, so it is right in development,
 * on a preview deploy and in production without anyone having to remember to
 * change a setting.
 */
async function appOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const protocol = incoming.get("x-forwarded-proto") ?? "https";

  const base = process.env.AUTH_URL ?? (host ? `${protocol}://${host}` : "");

  return base.replace(/\/$/, "");
}

export default async function ConnectWhatsAppPage() {
  const user = await requireUser();
  const { connection } = await getOnboardingState(user.id);

  if (!connection) notFound();

  if (connection.type === "API") {
    const saved = await describeCredentials(connection.id);

    return (
      <div className="space-y-8">
        <PageHeader
          title="Connect WhatsApp"
          description="Connect your number through the official WhatsApp Business API. Until this is done, your agent can't answer anyone."
        />

        <ApiConnect
          saved={
            saved
              ? {
                  phoneNumberId: saved.phoneNumberId,
                  appId: saved.appId,
                  businessAccountId: saved.businessAccountId,
                  displayPhoneNumber: saved.displayPhoneNumber,
                  webhookPathToken: saved.webhookPathToken,
                  webhookVerifyToken: saved.webhookVerifyToken,
                  webhookVerifiedAt: saved.webhookVerifiedAt?.toISOString() ?? null,
                }
              : null
          }
          status={connection.status}
          lastError={connection.lastError}
          messagesReceived={connection.messagesReceived}
          messagesSent={connection.messagesSent}
          appOrigin={await appOrigin()}
        />
      </div>
    );
  }

  // Whether the worker service is actually answering, not just configured.
  const serviceAvailable = await isQueueReachable();
  const live = serviceAvailable ? await readLiveState(connection.id) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Connect WhatsApp"
        description="Link the phone that has your business WhatsApp on it. Until this is done, your agent can't answer anyone."
      />

      <QrConnect
        initial={{
          status: (live?.status ?? connection.status) as never,
          message: live?.message ?? null,
          phoneNumber: live?.phoneNumber ?? connection.phoneNumber,
          qrImage: live?.qr ? await renderQrCode(live.qr) : null,
          messagesReceived: connection.messagesReceived,
          messagesSent: connection.messagesSent,
          lastMessageAt: connection.lastMessageAt?.toISOString() ?? null,
          lastError: connection.lastError,
          serviceAvailable,
        }}
      />
    </div>
  );
}
