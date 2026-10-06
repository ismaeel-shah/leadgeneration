import { listProfiles } from "@/actions/profiles";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { getReportData } from "@/queries/reports";

export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<{ preset?: string; profile?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const [data, profiles] = await Promise.all([
    getReportData({ preset: params.preset, profileId: params.profile, from: params.from, to: params.to }),
    listProfiles(),
  ]);
  return <ReportsDashboard data={data} profiles={profiles} />;
}
