# Message router

The single front door for every WhatsApp message that arrives, whichever
connector it came in through.

Today it always hands the message to the one bot that account chose, because an
account only ever has one (docs/PRD.md §3.1). It is written as a router anyway so
that routing between several bots stays possible later without rewriting
everything around it.

Built in **Phase 7**.
