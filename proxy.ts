import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Optimistic check only: redirects signed-out visitors to /login. Every server
// action and query still verifies the session and owner itself.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
