import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { Types } from "mongoose";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut, unstable_update: updateSession } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        await connectDB();
        const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
          .select("+passwordHash")
          .lean();
        if (!user || !(await compare(parsed.data.password, user.passwordHash))) return null;

        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
});

export async function requireUserId(): Promise<Types.ObjectId> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !Types.ObjectId.isValid(id)) throw new Error("You must be signed in.");
  return new Types.ObjectId(id);
}
