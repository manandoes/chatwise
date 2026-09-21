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
//   * the send button is disabled past the QR tier's 25-recipient cap,
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
import { describeRejected, parsePhoneList } from "@/campaigns/phone-list";
import {
  personalise,
  STARTER_TEMPLATES,
  unfilledPlaceholders,
} from "@/campaigns/templates/starter-templates";
import { capabilitiesFor } from "@/whatsapp-connectors/capabilities";

/**
 * The warning docs/PRD.md §7.2 requires, close to word for word.
 *
 * It is not softened, and it is not shown once and remembered — a QR-tier send
 * needs it accepted every time, because every send carries the risk afresh.
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
  /** The line appended to QR-tier messages that don't already say it. */
  optOutLine: string;
}) {
  const router = useRouter();
  const capabilities = capabilitiesFor(tier);
  const cap = capabilities.maxBulkRecipients;

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [phoneList, setPhoneList] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sendable = contacts.filter((contact) => !contact.optedOut);
  const unfilled = useMemo(() => unfilledPlaceholders(body), [body]);

  // The same parser the server uses (campaigns/phone-list.ts), run here only so
  // the count and the complaints appear while somebody is still typing. What
  // this says is never what decides — buildCampaign parses the same text again.
  const typed = useMemo(() => parsePhoneList(phoneList), [phoneList]);

  // Somebody can be in the picker *and* in a pasted list. The server merges
  // them into one recipient, so the number shown here has to do the same or it
  // would disagree with the cap that is actually applied.
  const chosenPhones = new Set(
    contacts
      .filter((contact) => chosen.has(contact.conversationId))
      .map((contact) => contact.contactPhone),
  );

  const addedByHand = typed.numbers.filter(
    (entry) => !chosenPhones.has(entry.phone),
  ).length;

  const total = chosen.size + addedByHand;
  const overCap = cap !== null && total > cap;

  // How many of the picker's contacts "select all" may take. Typed numbers have
  // already spent part of the cap, so filling it from the list alone would put
  // the send over before anybody had done anything wrong.
  const room =
    cap === null ? sendable.length : Math.max(0, cap - addedByHand);

  // The QR tier spaces its messages out (campaigns/throttle.ts). Saying so
  // beforehand is the difference between a slow send and a broken one.
  const minutes =
    capabilities.requiresBulkThrottle && total > 1
      ? Math.round(((total - 1) * 45_000) / 60_000)
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

  // What is actually going out. An approved template is sent by name and its
  // words are Meta's; anything else is free text that we finish with the
  // unsubscribe line. Which of the two it is decides the preview, and it no
  // longer depends on the tier — an API-tier campaign may now be free text
  // (docs/PRD.md §7.4).
  const sendsAsMetaTemplate = Boolean(
    templateId && templates.find((one) => one.id === templateId)?.metaName,
  );

  const blocked =
    isSending ||
    total === 0 ||
    overCap ||
    typed.rejected.length > 0 ||
    !name.trim() ||
    !body.trim() ||
    unfilled.length > 0 ||
    (capabilities.requiresBanRiskWarning && !acknowledged);

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
          phoneList,
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
    sendsAsMetaTemplate || body.toLowerCase().includes("unsubscribe")
      ? body
      : `${body.trimEnd()}\n\n${optOutLine}`,
    contacts.find((contact) => chosen.has(contact.conversationId))?.contactName ??
      typed.numbers.find((entry) => entry.name)?.name ??
      null,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>What to send</CardTitle>
          <CardDescription>
            Start from one of ours, or write your own. {"{name}"} is filled in
            for each person.
            {capabilities.requiresApprovedTemplates &&
              " On the WhatsApp Business API, Meta only accepts your own wording within 24 hours of somebody messaging you — to reach anyone else, pick an approved template."}
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

          {/* Shown on both tiers now. The API tier can send its own wording
              inside Meta's 24-hour window, so a starter is a real starting
              point there too rather than something it could never use. */}
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

          <div className="space-y-2">
            <Label htmlFor="campaign-body">The message</Label>
            <Textarea
              id="campaign-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              placeholder="Hi {name}, …"
            />

            {/* Editing an approved template's words means it is no longer that
                template, so the send stops being a template send and becomes
                free text — which Meta only accepts inside the 24-hour window.
                Said here rather than prevented, because inside that window it
                is a perfectly good thing to do. */}
            {sendsAsMetaTemplate && (
              <p className="text-xs text-text-secondary">
                These are the words Meta approved. Edit them and this goes out
                as your own wording instead, which Meta only accepts within 24
                hours of somebody messaging you.
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
              {!sendsAsMetaTemplate && (
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
            Pick from the people who have messaged you, add numbers of your own,
            or both.
            {cap !== null && ` Up to ${cap} people in total on your connection.`}
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
                      .slice(0, room)
                      .map((contact) => contact.conversationId),
                  ),
                )
              }
            >
              Select {cap === null ? "everyone" : `the first ${room}`}
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
              {total} {total === 1 ? "person" : "people"}
              {addedByHand > 0 &&
                ` (${chosen.size} picked, ${addedByHand} typed in)`}
              {cap !== null && ` of ${cap} allowed`}
            </span>
          </div>

          {contacts.length === 0 ? (
            <p className="text-small text-text-secondary">
              Nobody has messaged you yet — add the numbers you want to reach
              below.
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

          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="campaign-numbers">Or add numbers yourself</Label>
            <p className="text-xs text-text-secondary">
              One person per line, with the country code. Add a name after a
              comma to fill in {"{name}"} for them.
            </p>
            <Textarea
              id="campaign-numbers"
              value={phoneList}
              onChange={(event) => setPhoneList(event.target.value)}
              rows={4}
              className="font-mono text-small"
              placeholder={"919876543210, Priya\n+44 7700 900123"}
            />

            {typed.rejected.length > 0 && (
              <p className="text-small text-error">
                {describeRejected(typed.rejected)}.
              </p>
            )}

            {/* Only worth saying once there is somebody it applies to. These
                people never wrote in, which is the part of the list an owner
                should think hardest about (docs/Rules.md §8). */}
            {addedByHand > 0 && (
              <p className="text-xs text-text-secondary">
                {addedByHand === 1
                  ? "This person hasn't"
                  : `These ${addedByHand} people haven't`}{" "}
                messaged you before. Anyone who has unsubscribed is still left
                out automatically.
              </p>
            )}
          </div>

          {overCap && (
            <p className="text-small text-error">
              That&rsquo;s {total} people, and your connection allows {cap} in
              one send. Remove {total - (cap ?? 0)}.
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

            {/* The warning is about messaging people who did not ask to hear
                from you, and typing a number in is the way to do exactly that.
                Naming it is the honest thing to do at the point of sending. */}
            {addedByHand > 0 && (
              <p className="max-w-[70ch] text-pretty text-small font-medium leading-relaxed text-warning">
                {addedByHand} of these {total} people never messaged you. That
                is the send most likely to get a number banned — only continue
                if they gave you their number and expect to hear from you.
              </p>
            )}

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
