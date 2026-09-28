// Contacts — everyone the business knows, from WhatsApp, Shopify, payment
// links and imports, in one list. Filter by search, tag or saved segment.

import type { Metadata } from "next";
import Link from "next/link";

import { AddContactButton } from "@/components/dashboard/add-contact-button";
import { EmptyState, NativeSelect, Pill } from "@/components/dashboard/form-bits";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OPT_IN_STATUS_LABEL } from "@/lib/consent";
import { listContactsPage } from "@/lib/contacts";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format-money";
import { formatWhen } from "@/lib/format-when";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requirePageContext } from "@/lib/page-context";
import { describeSegmentFilter, segmentWhere, storedFilter } from "@/lib/segments";

export const metadata: Metadata = { title: "Contacts" };

const CONSENT_TONE = { OPTED_IN: "good", PENDING: "neutral", OPTED_OUT: "bad" } as const;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { business } = await requirePageContext();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");

  const search = one("q");
  const tag = one("tag");
  const segmentId = one("segment");
  const page = Number(one("page")) || 1;

  const [tags, segments] = await Promise.all([
    db.tag.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" }, select: { name: true } }),
    db.segment.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" }, select: { id: true, name: true, filter: true } }),
  ]);

  const segment = segments.find((row) => row.id === segmentId);
  const segmentFilter = segment ? storedFilter(segment.filter) : null;
  const where: Prisma.ContactWhereInput = {
    AND: [
      tag ? { tags: { some: { tag: { name: tag } } } } : {},
      segmentFilter ? segmentWhere(business.id, segmentFilter) : {},
    ],
  };

  const result = await listContactsPage(business.id, { search, where, page });

  const pageLink = (target: number) => {
    const query = new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(tag ? { tag } : {}),
      ...(segmentId ? { segment: segmentId } : {}),
      page: String(target),
    });

    return `/dashboard/contacts?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Everyone your business knows — from WhatsApp, Shopify, payment links and imports — in one place."
        action={<AddContactButton />}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="contacts-q" className="sr-only">
            Search
          </label>
          <Input id="contacts-q" name="q" defaultValue={search} placeholder="Search name, email or number" />
        </div>
        <NativeSelect name="tag" defaultValue={tag} aria-label="Tag" className="w-44">
          <option value="">Any tag</option>
          {tags.map((row) => (
            <option key={row.name} value={row.name}>
              {row.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="segment" defaultValue={segmentId} aria-label="Segment" className="w-52">
          <option value="">Any segment</option>
          {segments.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {segmentFilter && (
        <p className="text-small text-text-secondary">
          Segment &ldquo;{segment?.name}&rdquo;: {describeSegmentFilter(segmentFilter)}.
        </p>
      )}

      {result.total === 0 ? (
        <EmptyState title={search || tag || segmentId ? "Nobody matches" : "No contacts yet"}>
          {search || tag || segmentId
            ? "Try a different search or filter."
            : "Contacts appear here when someone messages you, orders from your Shopify store, or you add them."}
        </EmptyState>
      ) : (
        <>
          <p className="text-small text-text-secondary">
            {result.total.toLocaleString("en-IN")} {result.total === 1 ? "contact" : "contacts"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-small">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                  <th className="px-4 py-3 font-medium">Consent</th>
                  <th className="px-4 py-3 text-right font-medium">Spent</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((contact) => (
                  <tr key={contact.id} className="hover:bg-surface-elevated">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/contacts/${contact.id}`} className="font-medium text-text-primary hover:underline">
                        {contact.name || `+${contact.phone}`}
                      </Link>
                      {contact.name && <p className="text-xs text-text-secondary">+{contact.phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {contact.tags.slice(0, 4).map((row) => (
                          <Pill key={row.tag.name}>{row.tag.name}</Pill>
                        ))}
                        {contact.tags.length > 4 && <span className="text-xs text-text-secondary">+{contact.tags.length - 4}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={CONSENT_TONE[contact.optInStatus]}>{OPT_IN_STATUS_LABEL[contact.optInStatus]}</Pill>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(contact.totalSpent) > 0 ? formatMoney(contact.totalSpent.toString(), contact.currency ?? "INR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{contact.orderCount || "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{contact.lastOrderAt ? formatWhen(contact.lastOrderAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.pages > 1 && (
            <nav className="flex items-center justify-between text-small" aria-label="Pages">
              {result.page > 1 ? (
                <Link href={pageLink(result.page - 1)} className="text-primary underline">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {result.page} of {result.pages}
              </span>
              {result.page < result.pages ? (
                <Link href={pageLink(result.page + 1)} className="text-primary underline">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
