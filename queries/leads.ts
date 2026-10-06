import { getLead, listLeadActivities } from "@/actions/leads";
import { listProfiles } from "@/actions/profiles";
import { getSettings } from "@/actions/settings";
import { listTemplates } from "@/actions/templates";

/** Everything the lead detail page and side panel need, or null if not the user's lead. */
export async function getLeadDetail(id: string) {
  const lead = await getLead(id);
  if (!lead) return null;
  const [activities, profiles, templates, settings] = await Promise.all([
    listLeadActivities(id), listProfiles(), listTemplates(), getSettings(),
  ]);
  return { lead, activities, profiles, templates, settings };
}
