// Leads — the contacts your conversations turned into.
//
// Nobody types a lead in. Every row here was written by the background CRM
// agent while one of the other agents was answering somebody (docs/PRD.md §5,
// row 10), which is why the empty state talks about conversations rather than
// about an "Add lead" button that does not exist.
//
// Rendered on the server and not live: unlike the inbox, nothing here changes
// second by second, and a table that reshuffles itself under somebody's cursor
// while they are reading it is worse than one that waits to be reloaded.

import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { requireUser } from "@/lib/auth";
import { countLeadsByStatus, listLeads } from "@/lib/leads";
import { formatWhen } from "@/lib/format-when";
import { getOnboardingState } from "@/lib/onboarding";
import {
  LEAD_STATUS_OPTIONS,
  isLeadStatus,
  leadStatusLabel,
} from "@/lib/validation/leads";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { business } = await getOnboardingState(user.id);
  const { status } = await searchParams;

  // An unknown status in the address bar shows everything rather than an
  // error — there is nothing here worth refusing over.
  const filter = isLeadStatus(status) ? status : undefined;

  const [leads, counts] = await Promise.all([
    listLeads(business.id, filter),
    countLeadsByStatus(business.id),
  ]);

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Leads"
        description="The contacts your conversations turned into. Your agent keeps these up to date in the background — correct anything it gets wrong and it will leave that alone from then on."
      />

      {total === 0 ? (
        <div className="rounded-lg border border-border bg-surface/50 p-8">
          <h2 className="text-h3 font-semibold text-text-primary">
            Nothing yet
          </h2>
          <p className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
            Leads aren&rsquo;t typed in here. As people message your WhatsApp
            number, your agent works out who they are and what they want, and
            adds them to this list on its own.
          </p>
          <Link
            href="/dashboard/conversations"
            className="mt-4 inline-block text-small text-primary underline underline-offset-4"
          >
            See your conversations
          </Link>
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
            <FilterLink label={`All (${total})`} active={!filter} href="/dashboard/leads" />

            {LEAD_STATUS_OPTIONS.filter((option) => counts[option.value]).map(
              (option) => (
                <FilterLink
                  key={option.value}
                  label={`${option.label} (${counts[option.value]})`}
                  active={filter === option.value}
                  href={`/dashboard/leads?status=${option.value}`}
                />
              ),
            )}
          </nav>

          {leads.length === 0 ? (
            <p className="text-small text-text-secondary">
              No leads with that status.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/dashboard/leads/${lead.id}`}
                    className="block px-5 py-4 transition-colors hover:bg-surface-elevated"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-medium text-text-primary">
                        {lead.name?.trim() || `+${lead.contactPhone}`}
                      </span>

                      <span className="flex items-center gap-3 text-small text-text-secondary">
                        {lead.score !== null && <span>{lead.score}/100</span>}
                        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
                          {leadStatusLabel(lead.status)}
                        </span>
                      </span>
                    </div>

                    {lead.summary && (
                      <p className="mt-1 line-clamp-2 max-w-[80ch] text-small text-text-secondary">
                        {lead.summary}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {lead.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs text-text-secondary"
                        >
                          {tag}
                        </span>
                      ))}

                      {lead.hasHumanEdits && (
                        <span className="text-xs text-text-disabled">
                          Edited by you
                        </span>
                      )}

                      <span className="ml-auto text-xs text-text-disabled">
                        {formatWhen(lead.updatedAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-full border px-3 py-1 text-small transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-text-primary"
          : "border-border text-text-secondary hover:bg-surface-elevated",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
