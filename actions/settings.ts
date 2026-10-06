"use server";

import { revalidatePath } from "next/cache";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { requireUserId, updateSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User, { defaultUserSettings, type UserSettings } from "@/models/User";
import type { ActionResult } from "./types";
import { actionError } from "./types";

const settingsSchema = z.object({
  timezone: z.string().min(1).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone."),
  followUpGapDays: z.number().int().min(1).max(365),
  maxFollowUps: z.number().int().min(1).max(10),
  staleRequestDays: z.number().int().min(1).max(365),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
  services: z.array(z.string().trim().min(1).max(100)).max(100),
  tags: z.array(z.string().trim().min(1).max(50)).max(100),
  theme: z.enum(["system", "light", "dark"]),
});

export type SettingsInput = Partial<z.input<typeof settingsSchema>>;

export async function getSettings(): Promise<UserSettings> {
  const userId = await requireUserId();
  await connectDB();
  const user = await User.findOne({ _id: userId }).select("settings").lean();
  if (!user) throw new Error("Account not found.");
  return { ...defaultUserSettings, ...user.settings };
}

export async function updateSettings(input: SettingsInput): Promise<ActionResult<UserSettings>> {
  try {
    const userId = await requireUserId();
    const parsed = settingsSchema.partial().safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings." };
    await connectDB();
    const user = await User.findOne({ _id: userId }).select("settings").lean();
    if (!user) return { ok: false, error: "Account not found." };
    const settings = settingsSchema.parse({ ...defaultUserSettings, ...user.settings, ...parsed.data });
    await User.updateOne({ _id: userId }, { $set: { settings } });
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/leads");
    return { ok: true, data: settings };
  } catch (error) {
    return actionError(error);
  }
}

const accountSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
});

export type AccountDTO = z.output<typeof accountSchema>;

export async function getAccount(): Promise<AccountDTO> {
  const userId = await requireUserId();
  await connectDB();
  const user = await User.findOne({ _id: userId }).select("name email").lean();
  if (!user) throw new Error("Account not found.");
  return { name: user.name, email: user.email };
}

export async function updateAccount(input: z.input<typeof accountSchema>): Promise<ActionResult<AccountDTO>> {
  try {
    const userId = await requireUserId();
    const parsed = accountSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details." };
    await connectDB();
    if (await User.exists({ email: parsed.data.email, _id: { $ne: userId } })) {
      return { ok: false, error: "Another account already uses this email." };
    }
    await User.updateOne({ _id: userId }, { $set: parsed.data });
    await updateSession({ user: parsed.data });
    revalidatePath("/", "layout");
    return { ok: true, data: parsed.data };
  } catch (error) {
    return actionError(error);
  }
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(12, "Use at least 12 characters for the new password.").max(128),
});

export async function changePassword(input: z.input<typeof passwordSchema>): Promise<ActionResult<null>> {
  try {
    const userId = await requireUserId();
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the passwords." };
    await connectDB();
    const user = await User.findOne({ _id: userId }).select("+passwordHash").lean();
    if (!user) return { ok: false, error: "Account not found." };
    if (!(await compare(parsed.data.currentPassword, user.passwordHash))) {
      return { ok: false, error: "Your current password is incorrect." };
    }
    await User.updateOne({ _id: userId }, { $set: { passwordHash: await hash(parsed.data.newPassword, 12) } });
    return { ok: true, data: null };
  } catch (error) {
    return actionError(error);
  }
}
