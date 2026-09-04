// How signing in works.
//
// Two ways in: an email address with a password, or a Google account. Both end
// up at the same place — a `User` row in our database.
//
// Exports:
//   auth()     ask "who is signed in?" from a page, layout or API route
//   signIn()   start a sign-in
//   signOut()  end the session
//   handlers   the endpoints NextAuth needs, re-exported by app/api/auth/[...nextauth]

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { fakePasswordCheck, verifyPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/validation/auth";

// Tells TypeScript that our sessions carry the user's id, so pages and API
// routes can check who owns what (docs/Rules.md §3).
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Google sign-in only switches on once its credentials are set, so the app
 * still runs locally for anyone who hasn't set up a Google project yet.
 */
const googleProvider =
  googleClientId && googleClientSecret
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          allowDangerousEmailAccountLinking: false,
        }),
      ]
    : [];

export const isGoogleSignInEnabled = googleProvider.length > 0;

// The adapter's types still expect the Prisma Client to live in
// node_modules/@prisma/client. Prisma 7 generates it into our own project
// instead (lib/generated/prisma), so the two type declarations don't line up
// even though it is the same client with the same methods. The adapter only
// calls ordinary model methods on it, so this cast is safe — and it is narrowed
// to exactly the type the adapter asks for rather than switching off checking.
const prismaForAuth = db as unknown as Parameters<typeof PrismaAdapter>[0];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prismaForAuth),

  // Sessions live in a signed cookie rather than in the database. This is not a
  // preference — signing in with a password requires it.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Use our own screens rather than NextAuth's built-in ones.
  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    ...googleProvider,

    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const email = normalizeEmail(String(credentials?.email ?? ""));
        const password = String(credentials?.password ?? "");

        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });

        // No account, or an account that only signs in with Google. Spend the
        // same time either way so the response doesn't reveal which it was.
        if (!user?.passwordHash) {
          await fakePasswordCheck();
          return null;
        }

        if (!(await verifyPassword(password, user.passwordHash))) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    // Runs when the session cookie is created or refreshed. Copy the user's id
    // onto the token so it survives in the cookie.
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },

    // Runs whenever the app asks who is signed in.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/**
 * Use at the top of any page or API route that requires a signed-in user.
 * Returns the signed-in user, or sends them to the login screen.
 *
 * proxy.ts already blocks signed-out visitors from the dashboard, but this is
 * deliberately a second lock on the same door: a route that forgets to be in
 * the proxy's list is still protected, and every caller gets a guaranteed
 * user id to check ownership against (docs/Rules.md §3).
 */
export async function requireUser() {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

  return session.user;
}

/**
 * The signed-in user for an API route, or null.
 *
 * Unlike `requireUser()` this never redirects — an API route answers with a
 * 401 in the agreed error shape rather than sending a browser somewhere
 * (docs/Rules.md §4).
 */
export async function getApiUser() {
  const session = await auth();

  return session?.user?.id ? session.user : null;
}
