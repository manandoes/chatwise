# Background jobs

Work that happens on a schedule or in the background rather than while someone
waits on a page:

- `follow-up-scheduler.ts`  Sends follow-up messages after a quiet period
- `campaign-sender.ts`      Runs scheduled and throttled bulk sends **(built in Phase 12)**
- `reconnect-checker.ts`    Notices when a WhatsApp connection has dropped
- `usage-billing-sync.ts`   Keeps usage counters in step with billing

Jobs retry with a backoff if they fail, and failures are surfaced to the customer
rather than only to a developer (docs/Rules.md §4).

`campaign-sender.ts` runs inside the always-on WhatsApp host (`npm run
whatsapp-worker`), not in the web app: a throttled send takes twenty minutes and
no web request lives that long. It deliberately holds no state of its own — it
asks the database whose turn it is, so stopping and restarting it cannot cause a
message to go out twice.
