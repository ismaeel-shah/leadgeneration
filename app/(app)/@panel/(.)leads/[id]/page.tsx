import { notFound } from "next/navigation";
import { LeadDetail } from "@/components/leads/lead-detail";
import { LeadPanel } from "@/components/leads/lead-panel";
import { getLeadDetail } from "@/queries/leads";

export const runtime = "nodejs";

export default async function LeadPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getLeadDetail(id);
  if (!data) notFound();
  return <LeadPanel><LeadDetail {...data} variant="panel" /></LeadPanel>;
}
