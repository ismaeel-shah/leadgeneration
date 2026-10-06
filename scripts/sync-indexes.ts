import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { connectDB } from "../lib/db";
import User from "../models/User";
import Profile from "../models/Profile";
import Lead from "../models/Lead";
import Activity from "../models/Activity";
import Template from "../models/Template";
import Comment from "../models/Comment";

async function main() {
  loadEnvConfig(process.cwd());
  await connectDB();
  for (const model of [User, Profile, Lead, Activity, Template, Comment]) {
    await model.syncIndexes();
    process.stdout.write(`Synced ${model.modelName} indexes\n`);
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
