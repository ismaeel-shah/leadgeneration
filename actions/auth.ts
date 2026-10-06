"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User, { defaultUserSettings } from "@/models/User";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

export type SignupInput = z.input<typeof signupSchema>;

export async function signup(input: SignupInput): Promise<{ ok: boolean; error?: string }> {
  if (process.env.ALLOW_SIGNUP !== "true") {
    return { ok: false, error: "Sign-up is currently closed." };
  }

  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  await connectDB();
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email })) {
    return { ok: false, error: "An account already exists with this email." };
  }

  try {
    await User.create({
      name: parsed.data.name,
      email,
      passwordHash: await hash(parsed.data.password, 12),
      settings: defaultUserSettings,
    });
    return { ok: true };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return { ok: false, error: "An account already exists with this email." };
    }
    throw error;
  }
}

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type LoginInput = z.input<typeof loginSchema>;

export async function login(input: LoginInput): Promise<{ ok: boolean; error?: string }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password." };
  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: "Incorrect email or password." };
    throw error;
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
