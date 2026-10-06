/**
 * Creates default message templates and fills missing settings for an account.
 * Safe to run more than once: existing templates of a type are left alone.
 *
 *   npm run seed                 # the only account, if there is exactly one
 *   npm run seed -- you@site.com # a specific account
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { connectDB } from "../lib/db";
import Template from "../models/Template";
import User, { defaultUserSettings } from "../models/User";

const defaultTemplates = [
  {
    type: "connection_note",
    name: "Connection note",
    body: "Hi {{firstName}}, I came across your profile and would be glad to connect. – {{myName}}",
  },
  {
    type: "first_message",
    name: "First message",
    body: "Thanks for connecting, {{firstName}}! I'd love to learn a bit about what you're working on. Is there a good time for a short call this week?\n\n{{myName}}",
  },
  {
    type: "follow_up_1",
    name: "Follow-up 1",
    body: "Hi {{firstName}}, just bringing my last message back to the top. Happy to share a couple of relevant examples if useful.",
  },
  {
    type: "follow_up_2",
    name: "Follow-up 2",
    body: "Hi {{firstName}}, I'll leave it here for now. If the timing is better later, feel free to message me any time. All the best!",
  },
] as const;

async function main() {
  loadEnvConfig(process.cwd());
  await connectDB();
  const email = process.argv[2]?.toLowerCase();
  const users = await User.find(email ? { email } : {}).select("_id email settings").limit(2).lean();
  if (users.length === 0) throw new Error(email ? `No account found for ${email}.` : "No accounts yet. Sign up first.");
  if (users.length > 1) throw new Error("Several accounts exist. Run: npm run seed -- <email>");
  const user = users[0];

  await User.updateOne({ _id: user._id }, { $set: { settings: { ...defaultUserSettings, ...user.settings } } });
  process.stdout.write(`Settings checked for ${user.email}\n`);

  for (const template of defaultTemplates) {
    const exists = await Template.exists({ userId: user._id, type: template.type });
    if (exists) {
      process.stdout.write(`Skipped ${template.name}: a template of this type already exists\n`);
      continue;
    }
    await Template.create({ userId: user._id, ...template, isDefault: true });
    process.stdout.write(`Created default ${template.name}\n`);
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
