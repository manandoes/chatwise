# Campaigns (bulk outreach)

Sending one message to many contacts, personalised per person.

This is the riskiest feature in the app — done carelessly it can get a customer's
WhatsApp number banned — so the safety pieces here are not optional
(docs/Rules.md §8):

- `send-campaign.ts`  Core send logic. Rejects any free-tier send over **25 recipients**.
- `throttle.ts`       Spaces the free-tier messages out instead of firing them all at once.
- `templates/`        The ready-made message templates customers start from.
- `opt-out.ts`        Honours anyone who replied STOP — they are excluded from every send.

Built in **Phase 12**.
