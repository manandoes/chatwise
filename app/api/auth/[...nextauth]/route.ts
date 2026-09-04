// The endpoints NextAuth needs to handle sign-in, sign-out and the Google
// redirect. The actual configuration lives in lib/auth.ts.

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
