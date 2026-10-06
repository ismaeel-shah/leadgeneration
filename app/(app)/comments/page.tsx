import { listComments } from "@/actions/comments";
import { listProfiles } from "@/actions/profiles";
import { CommentsManager } from "@/components/comments/comments-manager";

export const runtime = "nodejs";

export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ profile?: string; log?: string }> }) {
  const params = await searchParams;
  const profileId = params.profile ?? "";
  const [comments, profiles] = await Promise.all([listComments({ profileId }), listProfiles()]);
  return <CommentsManager key={profileId} initial={comments} profiles={profiles} selectedProfileId={profileId} autoOpen={params.log === "1"} />;
}
