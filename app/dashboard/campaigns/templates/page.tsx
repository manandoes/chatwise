// The messages this business keeps to reuse.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { OPT_OUT_LINE } from "@/campaigns/opt-out";
import { listTemplates } from "@/campaigns/templates/saved-templates";
import { PageHeader } from "@/components/dashboard/page-header";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { capabilitiesFor } from "@/whatsapp-connectors/capabilities";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const user = await requireUser();
  const { business, connection } = await getOnboardingState(user.id);

  // What a template even *is* depends on the tier, so there is nothing sensible
  // to show before a number is connected.
  if (!connection) redirect("/dashboard/connect-whatsapp");

  const templates = await listTemplates(business.id);
  const capabilities = capabilitiesFor(connection.type);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-small text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-4" />
          All campaigns
        </Link>
      </div>

      <PageHeader
        title="Templates"
        description={
          capabilities.requiresApprovedTemplates
            ? "The messages Meta has approved for your number, and the ones you're still getting approved."
            : "Messages you send often, saved so you don't have to write them twice."
        }
      />

      <TemplateEditor
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          body: template.body,
          metaName: template.metaName,
          metaLanguage: template.metaLanguage,
          approval: template.approval,
          approvalLabel: template.approvalLabel,
        }))}
        needsMetaApproval={capabilities.requiresApprovedTemplates}
        optOutLine={OPT_OUT_LINE}
      />
    </div>
  );
}
