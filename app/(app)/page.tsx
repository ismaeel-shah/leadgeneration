import { listTodayLeads } from "@/actions/leads";
import { getProfileProgress, listProfiles } from "@/actions/profiles";
import { getSettings } from "@/actions/settings";
import { listTemplates } from "@/actions/templates";
import { TodayView } from "@/components/today/today-view";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  const { profile } = await searchParams;
  const [leads, profiles, progress, settings, templates, session] = await Promise.all([
    listTodayLeads(profile), listProfiles(), getProfileProgress(profile), getSettings(), listTemplates(), auth(),
  ]);
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, weekday: "long", day: "numeric", month: "long" }).format(now);
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
  const firstName = session?.user?.name?.split(/\s+/)[0] ?? "";
  return (
    <TodayView
      leads={leads}
      profiles={profiles}
      progress={progress}
      templates={templates}
      timezone={settings.timezone}
      today={today}
      localHour={localHour}
      firstName={firstName}
      filtered={!!profile}
    />
  );
}
