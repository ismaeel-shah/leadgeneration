/**
 * Integration test harness: an in-memory MongoDB replica set (transactions need
 * one) plus a fake signed-in user. Import this before any app module.
 */
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import Activity from "@/models/Activity";
import Comment from "@/models/Comment";
import Lead from "@/models/Lead";
import Profile from "@/models/Profile";
import Template from "@/models/Template";
import User from "@/models/User";

const signedIn = vi.hoisted(() => ({ userId: null as unknown as Types.ObjectId }));
export const session = signedIn;

/** Runs `fn` as another user, then switches back. */
export async function asUser<T>(userId: Types.ObjectId, fn: () => Promise<T>): Promise<T> {
  const previous = signedIn.userId;
  signedIn.userId = userId;
  try { return await fn(); } finally { signedIn.userId = previous; }
}

vi.mock("@/lib/auth", () => ({
  requireUserId: async () => signedIn.userId,
  auth: async () => ({ user: { id: String(signedIn.userId), name: "Test User", email: "test@example.com" } }),
  updateSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = replSet.getUri("leadflow-test");
  await connectDB();
  // Collections must exist before they're used inside a transaction.
  for (const model of [Activity, Comment, Lead, Profile, Template, User]) await model.createCollection();
});

beforeEach(async () => {
  signedIn.userId = new Types.ObjectId();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
