"use client";

// The pipeline board. Cards can be dragged between columns, or moved with the
// stage menu on the card (for keyboards and phones). Opening a card shows
// its details and the full activity log, where notes can be added.

import { LoaderCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorNote, NativeSelect } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/client-api";

type Stage = "LEAD" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";

type Deal = {
  id: string;
  title: string;
  stage: Stage;
  value: number;
  currency: string;
  position: number;
  expectedClose: string;
  contactId: string;
  contactLabel: string;
  ownerId: string;
  ownerName: string | null;
};

type Activity = {
  id: string;
  kind: string;
  fromStage: Stage | null;
  toStage: Stage | null;
  note: string | null;
  actor: string;
  createdAt: string;
};

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export function DealsBoard({
  stages,
  deals,
  members,
  contacts,
}: {
  stages: { stage: Stage; label: string }[];
  deals: Deal[];
  members: { id: string; name: string }[];
  contacts: { id: string; label: string }[];
}) {
  const router = useRouter();
  // Moves made on screen that the server hasn't confirmed yet, laid over the
  // server's copy — so a drag shows straight away, and a refused one snaps back.
  const [moves, setMoves] = useState<Record<string, { stage: Stage; position: number }>>({});
  const board = deals.map((deal) => (moves[deal.id] ? { ...deal, ...moves[deal.id] } : deal));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const labelOf = Object.fromEntries(stages.map((one) => [one.stage, one.label])) as Record<Stage, string>;

  async function move(id: string, stage: Stage) {
    const deal = board.find((one) => one.id === id);

    if (!deal || deal.stage === stage) return;

    const bottom = Math.max(0, ...board.filter((one) => one.stage === stage).map((one) => one.position)) + 1;

    setMoves((current) => ({ ...current, [id]: { stage, position: bottom } }));
    setError(null);

    const result = await callApi(`/api/deals/${id}`, { method: "PATCH", body: { stage, position: bottom } });

    if (!result.ok) {
      setError(result.message);
      setMoves((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      router.refresh();
    }
  }

  const openDeal = board.find((one) => one.id === open) ?? null;

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <div className="flex justify-end">
        <Button type="button" onClick={() => setAdding(true)}>
          <Plus /> New deal
        </Button>
      </div>

      {adding && <NewDealForm contacts={contacts} members={members} onClose={() => setAdding(false)} />}

      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5">
        {stages.map(({ stage, label }) => {
          const column = board.filter((deal) => deal.stage === stage).sort((a, b) => a.position - b.position);
          const total = column.reduce((sum, deal) => sum + deal.value, 0);

          return (
            <section
              key={stage}
              aria-label={label}
              className={`min-w-56 rounded-lg border bg-surface/60 p-3 ${dragging ? "border-dashed border-primary/40" : "border-border"}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain");

                setDragging(null);
                if (id) void move(id, stage);
              }}
            >
              <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-small font-semibold text-text-primary">{label}</h2>
                <span className="text-xs text-text-secondary">
                  {column.length} · {column.length > 0 ? money(total, column[0].currency) : "—"}
                </span>
              </header>

              <ul className="space-y-2">
                {column.map((deal) => (
                  <li
                    key={deal.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", deal.id);
                      setDragging(deal.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className="cursor-grab rounded-md border border-border bg-surface p-3 shadow-sm active:cursor-grabbing"
                  >
                    <button type="button" className="block w-full text-left" onClick={() => setOpen(deal.id)}>
                      <p className="font-medium text-text-primary">{deal.title}</p>
                      <p className="text-xs text-text-secondary">{deal.contactLabel}</p>
                      <p className="mt-1 text-small tabular-nums text-text-primary">{money(deal.value, deal.currency)}</p>
                      {deal.ownerName && <p className="text-xs text-text-secondary">{deal.ownerName}</p>}
                    </button>
                    <NativeSelect
                      aria-label={`Move ${deal.title}`}
                      className="mt-2 h-8 text-xs"
                      value={deal.stage}
                      onChange={(event) => move(deal.id, event.target.value as Stage)}
                    >
                      {stages.map((one) => (
                        <option key={one.stage} value={one.stage}>
                          {one.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {openDeal && (
        <DealPanel deal={openDeal} members={members} labelOf={labelOf} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function NewDealForm({
  contacts,
  members,
  onClose,
}: {
  contacts: { id: string; label: string }[];
  members: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [contactLabel, setContactLabel] = useState("");
  const [value, setValue] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();

    const contact = contacts.find((one) => one.label === contactLabel);

    if (!contact) {
      setError("Choose a contact from the list.");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await callApi("/api/deals", {
      body: { title, contactId: contact.id, value: value || 0, ownerId: ownerId || null },
    });

    setBusy(false);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-lg border border-primary/40 bg-surface p-5 sm:grid-cols-4">
      <div className="sm:col-span-4">
        <ErrorNote message={error} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="deal-title">What&apos;s the deal?</Label>
        <Input id="deal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bulk order, 40 units" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="deal-contact">With</Label>
        <Input id="deal-contact" list="deal-contacts" value={contactLabel} onChange={(e) => setContactLabel(e.target.value)} required />
        <datalist id="deal-contacts">
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.label} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1">
        <Label htmlFor="deal-value">Value</Label>
        <Input id="deal-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="deal-owner">Owner</Label>
        <NativeSelect id="deal-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">Nobody yet</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          Add deal
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const ACTIVITY_WORDS: Record<string, string> = {
  CREATED: "created the deal",
  STAGE_CHANGED: "moved it",
  VALUE_CHANGED: "changed the value",
  OWNER_CHANGED: "changed the owner",
  NOTE: "added a note",
};

function DealPanel({
  deal,
  members,
  labelOf,
  onClose,
}: {
  deal: Deal;
  members: { id: string; name: string }[];
  labelOf: Record<Stage, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(String(deal.value));
  const [ownerId, setOwnerId] = useState(deal.ownerId);
  const [expectedClose, setExpectedClose] = useState(deal.expectedClose);
  const [note, setNote] = useState("");
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadActivity() {
    const result = await callApi<{ activity: Activity[] }>(`/api/deals/${deal.id}/notes`);

    if (result.ok) setActivity(result.data.activity);
  }

  // Loaded when a deal is opened; a slow answer for a deal already closed is dropped.
  useEffect(() => {
    let current = true;

    callApi<{ activity: Activity[] }>(`/api/deals/${deal.id}/notes`).then((result) => {
      if (current && result.ok) setActivity(result.data.activity);
    });

    return () => {
      current = false;
    };
  }, [deal.id]);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);

    const result = await callApi(url, { method, body });

    setBusy(false);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return false;
    }

    await loadActivity();
    router.refresh();
    return true;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={deal.title}>
      <div className="h-full w-full max-w-md space-y-5 overflow-y-auto bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-h3 font-semibold text-text-primary">{deal.title}</h2>
            <p className="text-small text-text-secondary">
              {deal.contactLabel} · {labelOf[deal.stage]}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>

        <ErrorNote message={error} />

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void call(`/api/deals/${deal.id}`, "PATCH", {
              title,
              value: value || 0,
              ownerId: ownerId || null,
              expectedClose: expectedClose || null,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="panel-title">Title</Label>
            <Input id="panel-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="panel-value">Value ({deal.currency})</Label>
              <Input id="panel-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="panel-close">Expected to close</Label>
              <Input id="panel-close" type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="panel-owner">Owner</Label>
            <NativeSelect id="panel-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Nobody</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            Save
          </Button>
        </form>

        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="font-semibold text-text-primary">Activity</h3>
          <form
            className="space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();

              if (await call(`/api/deals/${deal.id}/notes`, "POST", { note })) setNote("");
            }}
          >
            <Textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
            <Button type="submit" variant="outline" size="sm" disabled={busy || !note.trim()}>
              Add note
            </Button>
          </form>

          {!activity ? (
            <p className="text-small text-text-secondary">Loading…</p>
          ) : (
            <ol className="space-y-3 text-small">
              {[...activity].reverse().map((item) => (
                <li key={item.id} className="border-l-2 border-border pl-3">
                  <p className="text-text-primary">
                    <span className="font-medium">{item.actor}</span> {ACTIVITY_WORDS[item.kind] ?? item.kind}
                    {item.kind === "STAGE_CHANGED" && item.fromStage && item.toStage
                      ? ` from ${labelOf[item.fromStage]} to ${labelOf[item.toStage]}`
                      : ""}
                  </p>
                  {item.note && <p className="whitespace-pre-wrap text-text-secondary">{item.note}</p>}
                  <p className="text-xs text-text-secondary">{new Date(item.createdAt).toLocaleString("en-IN")}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (window.confirm(`Delete "${deal.title}"? Its activity log goes too.`)) {
              if (await call(`/api/deals/${deal.id}`, "DELETE")) onClose();
            }
          }}
        >
          Delete deal
        </Button>
      </div>
    </div>
  );
}
