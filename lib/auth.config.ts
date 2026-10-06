import type { NextAuthConfig } from "next-auth";

const publicPaths = ["/login", "/signup"];

/**
 * Database-free part of the Auth.js config, shared by `proxy.ts` and `lib/auth.ts`.
 * Providers that touch MongoDB are added in `lib/auth.ts` only.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isPublic = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));
      if (isPublic) return true;
      return !!auth?.user;
    },
    jwt({ token, user, trigger, session }) {
      if (user?.id) token.sub = user.id;
      // Settings → Account calls updateSession() after changing name or email.
      if (trigger === "update" && session?.user) {
        if (typeof session.user.name === "string") token.name = session.user.name;
        if (typeof session.user.email === "string") token.email = session.user.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
