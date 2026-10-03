// Shared in-memory state between the web app and the WhatsApp session manager.
//
// In Option A (single process), the web app reads live state from this Map and
// the session manager writes to it. No Redis, no queue, no cross-process
// communication overhead.
//
// This file is deliberately free of Node.js built-ins so Next.js can bundle it.
// The session manager (session-manager.ts) imports from here and adds the
// `node:child_process` fork; the app routes import only this file.

import type { LiveSessionState } from "./protocol.ts";

/**
 * Live connection state, keyed by connection id.
 *
 * The session manager writes to this; the web app reads from it.
 */
const liveState = new Map<string, LiveSessionState>();

export { liveState };
export type { LiveSessionState };
