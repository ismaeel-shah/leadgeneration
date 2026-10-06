import { redirect } from "next/navigation";
import { auth, requireUserId } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { listProfiles } from "@/actions/profiles";
import { getSettings } from "@/actions/settings";
import { AppShell } from "@/components/layout/app-shell";
import { countTodayQueue } from "@/queries/today";

export const runtime = "nodejs";

export default async function PrivateLayout({ children, panel }: { children: React.ReactNode; panel: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = await requireUserId();
  await connectDB();
  const [profiles, settings] = await Promise.all([listProfiles(), getSettings()]);
  const todayCount = await countTodayQueue(userId, settings);
  return (
    <AppShell
      userName={session.user.name ?? session.user.email ?? "Your account"}
      profiles={profiles}
      settings={settings}
      todayCount={todayCount}
    >
      {children}
      {panel}
    </AppShell>
  );
}
