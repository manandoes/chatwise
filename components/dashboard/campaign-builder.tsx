"use client";

// Writing a bulk send, and choosing who gets it.
//
// This screen carries the safety rules docs/Rules.md §8 asks for, and it is the
// **second** place each of them is enforced — campaigns/send-campaign.ts is the
// first, and the one that actually decides. Anything here can be got around by
// somebody with a terminal; nothing here is the only thing standing between a
// customer and a banned phone number.
//
// What it is genuinely for is stopping a mistake before it is made:
//
//   * the send button is disabled past the free tier's 25-recipient cap,
//   * people who unsubscribed are shown, greyed, and cannot be selected,
//   * the ban-risk warning has to be ticked before anything can go (§7.2),
//   * the opt-out line that will be appended is shown, so nobody is surprised,
//   * and it says out loud how long a throttled send is going to take, because
//     twenty-five messages over twenty minutes surprises people otherwise.

import { AlertTriangle, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  personalise,
  STARTER_TEMPLATES,
  unfilledPlaceholders,
} from "@/campaigns/templates/starter-templates";
import { capabilitiesFor } from "@/whatsapp-connectors/capabilities";

/**
 * The warning docs/PRD.md §7.2 requires, close to word for word.
 *
 * It is not softened, and it is not shown once and remembered — a free-tier
 * send needs it accepted every time, because every send carries the risk
 * afresh.
 */
const BAN_RISK_WARNING =
  "You're sending from a WhatsApp Web connection. Sending to people who haven't opted in, or sending too often, can get your WhatsApp number banned by WhatsApp. Only message contacts who expect to hear from you. For safe, large-scale outreach, upgrade to the WhatsApp Business API.";

export type BuilderContact = {
  conversationId: string;
  contactPhone: string;
  contactName: string | null;
  optedOut: boolean;
};

export type BuilderTemplate = {
  id: string;
  name: string;
  body: string;
  usable: boolean;
  approvalLabel: string;
  metaName: string | null;
};

export function CampaignBuilder({
  tier,
  contacts,
  templates,
  optOutLine,
}: {
  tier: "QR" | "API";
  contacts: BuilderContact[];
  templates: BuilderTemplate[];
  /** The line appended to free-tier messages that don't already say it. */
  optOutLine: string;
}) {
  const router = useRouter();
  const capabilities = capabilitiesFor(tier);
  const cap = capabilities.maxBulkRecipients;

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sendable = contacts.filter((contact) => !contact.optedOut);
  const overCap = cap !== null && chosen.size > cap;
  const unfilled = useMemo(() => unfilledPlaceholders(body), [body]);

  // The free tier spaces its messages out (campaigns/throttle.ts). Saying so
  // beforehand is the difference between a slow send and a broken one.
  const minutes =
    capabilities.requiresBulkThrottle && chosen.size > 1
      ? Math.round(((chosen.size - 1) * 45_000) / 60_000)
      : 0;

  function toggle(contact: BuilderContact) {
    if (contact.optedOut) return;

    setChosen((current) => {
      const next = new Set(current);

      if (next.has(contact.conversationId)) next.delete(contact.conversationId);
      else next.add(contact.conversationId);

      return next;
    });
  }

  function applyTemplate(id: string, text: string, saved: boolean) {
    setBody(text);
    setTemplateId(saved ? id : null);
    setError(null);
  }

  const blocked =
    isSending ||
    chosen.size === 0 ||
    overCap ||
    !name.trim() ||
    !body.trim() ||
    unfilled.length > 0 ||
    (capabilities.requiresBanRiskWarning && !acknowledged) ||
    (capabilities.requiresApprovedTemplates && !templateId);

  async function send() {
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          body,
          templateId,
          conversationIds: [...chosen],
          warningAcknowledged: acknowledged,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "That didn't send. Try again.");

        return;
      }

      router.push(`/dashboard/campaigns/${payload.campaignId}`);
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsSending(false);
    }
  }

  const preview = personalise(
    capabilities.requiresApprovedTemplates || body.toLowerCase().includes("unsubscribe")
      ? body
      : `${body.trimEnd()}\n\n${optOutLine}`,
    contacts.find((contact) => chosen.has(contact.conversationId))?.contactName ??
      null,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>What to send</CardTitle>
          <CardDescription>
            {capabilities.requiresApprovedTemplates
              ? "On the WhatsApp Business API, a campaign goes out as one of your Meta-approved templates."
              : "Start from one of ours, or write your own. {name} is filled in for each person."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <p className="text-xs text-text-secondary">
              Just for you — your customers never see it.
            </p>
            <Input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="October offer"
            />
          </div>

          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>Your templates</Label>
              <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id, template.body, true)}
                    disabled={
                      capabilities.requiresApprovedTemplates && !template.usable
                    }
                    aria-pressed={templateId === template.id}
                    className={[
                      "rounded-full border px-3 py-1.5 text-small transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      templateId === template.id
                        ? "border-primary/40 bg-primary/10 text-text-primary"
                        : "border-border text-text-secondary hover:bg-surface-elevated",
                    ].join(" ")}
                  >
                    {template.name}
                    {capabilities.requiresApprovedTemplates && (
                      <span className="ml-2 text-xs text-text-disabled">
                        {template.approvalLabel}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!capabilities.requiresApprovedTemplates && (
            <div className="space-y-2">
              <Label>Or start from one of ours</Label>
              <div className="flex flex-wrap gap-2">
                {STARTER_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id, template.body, false)}
                    className="rounded-full border border-border px-3 py-1.5 text-small text-text-secondary transition-colors hover:bg-surface-elevated"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="campaign-body">The message</Label>
            <Textarea
              id="campaign-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              placeholder="Hi {name}, …"
              readOnly={capabilities.requiresApprovedTemplates}
            />

            {capabilities.requiresApprovedTemplates && (
              <p className="text-xs text-text-secondary">
                These are the words Meta approved, so they can&rsquo;t be edited
                here. Change them in Meta, then update the template.
              </p>
            )}

            {unfilled.length > 0 && (
              <p className="text-small text-warning">
                Still to fill in: {unfilled.join(", ")}. Only {"{name}"} is
                filled in for you.
              </p>
            )}
          </div>

          {body.trim() && (
            <div className="space-y-2">
              <Label>What they&rsquo;ll get</Label>
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-elevated p-4 text-small leading-relaxed text-text-primary">
                {preview}
              </p>
              {!capabilities.requiresApprovedTemplates && (
                <p className="text-xs text-text-secondary">
                  We add the unsubscribe line if your message doesn&rsquo;t
                  already have one. Every bulk message needs a way out.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who gets it</CardTitle>
          <CardDescription>
            People who have messaged you. You can only reach somebody who wrote
            to you first.
            {cap !== null && ` Up to ${cap} at a time on your connection.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setChosen(
                  new Set(
                    sendable
                      .slice(0, cap ?? sendable.length)
                      .map((contact) => contact.conversationId),
                  ),
                )
              }
            >
              Select {cap === null ? "everyone" : `the first ${cap}`}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setChosen(new Set())}
            >
              Clear
            </Button>

            <span
              className={`text-small ${overCap ? "text-error" : "text-text-secondary"}`}
            >
              {chosen.size} chosen
              {cap !== null && ` of ${cap} allowed`}
            </span>
          </div>

          {contacts.length === 0 ? (
            <p className="text-small text-text-secondary">
              Nobody has messaged you yet, so there is nobody to send to.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {contacts.map((contact) => (
                <li key={contact.conversationId}>
                  <label
                    className={`flex items-center gap-3 px-4 py-2.5 text-small ${
                      contact.optedOut
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-surface-elevated"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={chosen.has(contact.conversationId)}
                      disabled={contact.optedOut}
                      onChange={() => toggle(contact)}
                    />
                    <span className="text-text-primary">
                      {contact.contactName?.trim() || `+${contact.contactPhone}`}
                    </span>
                    {contact.optedOut && (
                      <span className="ml-auto text-xs text-text-disabled">
                        Unsubscribed
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {overCap && (
            <p className="text-small text-error">
              That&rsquo;s more than your connection allows in one send. Choose
              at most {cap}.
            </p>
          )}
        </CardContent>
      </Card>

      {capabilities.requiresBanRiskWarning && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="size-5" />
              Read this before you send
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="max-w-[70ch] text-pretty text-small leading-relaxed text-text-primary">
              {BAN_RISK_WARNING}
            </p>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span className="text-small leading-relaxed text-text-primary">
                I understand the risk, and everybody I&rsquo;ve chosen expects
                to hear from me.
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {minutes > 0 && (
        <p className="text-small text-text-secondary">
          These go out one at a time, spaced apart, so this send will take about{" "}
          {minutes} {minutes === 1 ? "minute" : "minutes"}. That spacing is what
          keeps your number safe — you can close this page, it carries on.
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="button" onClick={send} disabled={blocked}>
        {isSending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        {isSending
          ? "Starting…"
          : `Send to ${chosen.size} ${chosen.size === 1 ? "person" : "people"}`}
      </Button>
    </div>
  );
}
