// Connect WhatsApp.
//
// Free tier only for now — the official Business API form is Phase 6. An
// account is one or the other, never both (docs/PRD.md §3.1), so this screen
// shows whichever applies rather than offering a choice.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";
import { QrConnect } from "@/components/dashboard/qr-connect";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { renderQrCode } from "@/whatsapp-connectors/web-qr/qr-generator";
import {
  isQueueReachable,
  readLiveState,
} from "@/whatsapp-connectors/web-qr/session-commands";

export const metadata: Metadata = { title: "Connect WhatsApp" };

export default async function ConnectWhatsAppPage() {
  const user = await requireUser();
  const { connection } = await getOnboardingState(user.id);

  if (!connection) notFound();

  // Accounts on the official API don't scan anything — that form is Phase 6.
  if (connection.type === "API") {
    return (
      <ComingSoon
        title="Connect WhatsApp"
        description="Your account uses the official WhatsApp Business API. The setup form for it is still being built."
        icon="Smartphone"
        phase="Phase 6"
        willDo={[
          "Enter your Meta app ID, phone number ID and access token",
          "Follow a step-by-step guide through Meta's approval process",
          "See whether your number is connected, in plain words",
        ]}
      />
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
