import { getProfileProgress } from "@/actions/profiles";
import { ProfilesView } from "@/components/profiles/profiles-view";

export const runtime = "nodejs";

export default async function ProfilesPage() {
  const profiles = await getProfileProgress(undefined, { includeInactive: true });
  return <ProfilesView profiles={profiles} />;
}
