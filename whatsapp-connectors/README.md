# WhatsApp connectors

Everything to do with actually talking to WhatsApp. Two ways in:

- `business-api/`  The official WhatsApp Business Cloud API from Meta. Paid tier,
                   charged per message, reliable, no ban risk. (**Phase 6**)
- `web-qr/`        The free tier: the customer scans a QR code with their phone,
                   the way WhatsApp Web works. Each customer's session runs in its
                   own separate worker process so one customer's problem can never
                   affect anyone else's (docs/Architecture.md §5). (**Phase 5**)
