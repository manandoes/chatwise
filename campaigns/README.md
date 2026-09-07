# Campaigns (bulk outreach)

Sending one message to many contacts, personalised per person.

This is the riskiest feature in the app — done carelessly it can get a customer's
WhatsApp number banned — so the safety pieces here are not optional
(docs/Rules.md §8):

- `send-campaign.ts`  Core send logic. Rejects any QR-tier send over **25 recipients**.
- `throttle.ts`       Spaces the QR-tier messages out instead of firing them all at once.
- `templates/`        The ready-made message templates customers start from.
- `opt-out.ts`        Honours anyone who replied STOP — they are excluded from every send.

Also here:

- `templates/starter-templates.ts`  The ready-made wording, shipped as code.
- `templates/saved-templates.ts`    A business's own templates, and on the paid
                                    tier what Meta approved.

## The two things most worth knowing

**You can only message somebody who messaged you first.** Contacts come from the
conversations this account already has. There is no import, and nowhere to type
a phone number in. It is the strongest thing the product does to keep its
customers out of trouble.

**Nobody is ever messaged twice.** Each recipient row is claimed atomically
before it is sent, and a send interrupted half-way is failed rather than
retried — "possibly sent twice" is worse than "definitely not sent" when the
cost is somebody's phone number being banned.

The clock that lets messages out lives in `jobs/campaign-sender.ts`, on the
always-on host. The spacing itself is a `sendAfter` column, not a timer, so a
restart loses nothing.

Built in **Phase 12**.
