import { getLeadFilterOptions, listLeads, type LeadListFilters } from "@/actions/leads";
import { leadSortKeys, type LeadSortKey } from "@/lib/constants";
import { listProfiles } from "@/actions/profiles";
import { getSettings } from "@/actions/settings";
import { PipelineView } from "@/components/leads/pipeline-view";
import { leadStages } from "@/models/Lead";
import type { LeadStage } from "@/lib/rules";

export const runtime = "nodejs";

const PAGE_SIZE = 50;
const BOARD_LIMIT = 500;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const view = params.view === "board" ? "board" : "table";
  const page = Math.max(1, Number(params.page) || 1);
  const filters: LeadListFilters = {
    profileId: params.profile,
    country: params.country,
    service: params.service,
    stage: leadStages.includes(params.stage as LeadStage) ? params.stage as LeadStage : undefined,
    tag: params.tag,
    search: params.q,
    hasOverdueAction: params.overdue === "1",
    addedFrom: params.from,
    addedTo: params.to,
    sort: leadSortKeys.includes(params.sort as LeadSortKey) ? params.sort as LeadSortKey : undefined,
    dir: params.dir === "asc" ? "asc" : "desc",
    page: view === "table" ? page : 1,
    limit: view === "table" ? PAGE_SIZE : BOARD_LIMIT,
  };
  const [result, profiles, options, settings] = await Promise.all([
    listLeads(filters), listProfiles(), getLeadFilterOptions(), getSettings(),
  ]);
  return <PipelineView result={result} profiles={profiles} options={options} settings={settings} view={view} params={params} />;
}
