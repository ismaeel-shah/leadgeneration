import { notFound } from "next/navigation";
import { LeadDetail } from "@/components/leads/lead-detail";
import { getLeadDetail } from "@/queries/leads";

export const runtime = "nodejs";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getLeadDetail(id);
  if (!data) notFound();
  return <LeadDetail {...data} variant="page" />;
}
