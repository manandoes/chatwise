# Background jobs

Work that happens on a schedule or in the background rather than while someone
waits on a page:

- `follow-up-scheduler.ts`  Sends follow-up messages after a quiet period
- `campaign-sender.ts`      Runs scheduled and throttled bulk sends
- `reconnect-checker.ts`    Notices when a WhatsApp connection has dropped
- `usage-billing-sync.ts`   Keeps usage counters in step with billing

Jobs retry with a backoff if they fail, and failures are surfaced to the customer
rather than only to a developer (docs/Rules.md §4).
