"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart3, CalendarDays, TrendingUp } from "lucide-react";
import type { ProfileDTO } from "@/actions/profiles";
import type { MetricRow, ReportData, ReportPreset } from "@/queries/reports";
import styles from "./reports.module.css";

const presets: Array<{ value: ReportPreset; label: string }> = [
  { value: "this_week", label: "This week" },
  { value: "last_7", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_30", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

function formatNumber(value: number) { return new Intl.NumberFormat("en").format(value); }
function rateText(value: number | null) { return value === null ? "—" : `${value}%`; }
function shortDay(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function MetricsTable({ rows, firstLabel, empty }: {
  rows: MetricRow[];
  firstLabel: string;
  empty: string;
}) {
  return rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>{firstLabel}</th><th>Requests</th><th>Accepted</th><th>Acceptance</th><th>Messaged</th><th>Replies</th><th>Reply rate</th><th>Meetings</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td className="strong">{row.label}</td><td className="tabular">{formatNumber(row.requests)}</td><td className="tabular">{formatNumber(row.accepted)}</td><td className="tabular">{rateText(row.acceptanceRate)}</td><td className="tabular">{formatNumber(row.firstMessages)}</td><td className="tabular">{formatNumber(row.replies)}</td><td className="tabular">{rateText(row.replyRate)}</td><td className="tabular">{formatNumber(row.meetings)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><p>{empty}</p></div>;
}

export function ReportsDashboard({ data, profiles }: { data: ReportData; profiles: ProfileDTO[] }) {
  const router = useRouter();
  const [pendingPreset, setPendingPreset] = useState<ReportPreset>(data.preset);
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [rangeError, setRangeError] = useState("");
  const totalReplies = data.replyAfter.firstMessage + data.replyAfter.followUp1 + data.replyAfter.followUp2;
  const chartData = data.daily.map((row) => ({ ...row, label: shortDay(row.day) }));
  const hasActivity = data.funnel.some((step) => step.count > 0);

  function navigate(preset: ReportPreset, profileId = data.profileId, start = from, end = to) {
    const params = new URLSearchParams();
    params.set("preset", preset);
    if (profileId) params.set("profile", profileId);
    if (preset === "custom") { params.set("from", start); params.set("to", end); }
    router.push(`/reports?${params.toString()}`);
  }

  function choosePreset(preset: ReportPreset) {
    setPendingPreset(preset);
    setRangeError("");
    if (preset !== "custom") navigate(preset);
  }

  function applyCustom() {
    if (!from || !to || from > to) { setRangeError("Choose a start date on or before the end date."); return; }
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    if (days > 365) { setRangeError("Choose a range of up to 366 days."); return; }
    setRangeError("");
    navigate("custom");
  }

  return <div className={styles.page}>
    <div className="page-heading"><div><div className="eyebrow">Activity insights</div><h1 className="page-title">Reports</h1><p className="page-description">See which profiles and markets turn outreach into conversations.</p></div></div>
    <div className={`card ${styles.filters}`}><div className={styles.presetRow} role="group" aria-label="Date range">{presets.map((preset) => <button key={preset.value} type="button" className={`${styles.preset} ${pendingPreset === preset.value ? styles.active : ""}`} onClick={() => choosePreset(preset.value)}>{preset.value === "custom" && <CalendarDays size={13} />}{preset.label}</button>)}</div><div className={styles.filterBottom}><label className={styles.profileFilter}>Profile <select className="input" value={data.profileId} onChange={(event) => navigate(data.preset, event.target.value, data.from, data.to)}><option value="">All profiles</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><span className={styles.dateSpan}>{shortDay(data.from)} – {shortDay(data.to)} <span>· {data.timezone}</span></span></div>{pendingPreset === "custom" && <div className={styles.customRange}><label>From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="button" className="button primary" onClick={applyCustom}>Apply dates</button></div>}{(rangeError || data.notice) && <p className={styles.notice} role="status">{rangeError || data.notice}</p>}</div>

    <section className={styles.section}><div className={styles.heading}><div><h2 className="section-title">Outreach funnel</h2><p>How activity moves from requests to wins</p></div><TrendingUp size={17} /></div><div className={styles.funnel}>{data.funnel.map((step, index) => <div className={`card ${styles.funnelStep}`} key={step.key}><span className={styles.stepNumber}>0{index + 1}</span><strong className="tabular">{formatNumber(step.count)}</strong><span className={styles.stepLabel}>{step.label}</span>{index > 0 && <span className={styles.conversion}>{rateText(step.conversion)} from previous</span>}</div>)}</div><p className={styles.footnote}>Counts reflect events in this date range. A conversion can exceed 100% when the earlier step happened before the range.</p></section>

    <section className={styles.section}><div className={styles.heading}><div><h2 className="section-title">Activity over time</h2><p>Daily requests, acceptances, and replies</p></div><BarChart3 size={17} /></div><div className={`card ${styles.chartCard}`}>{hasActivity ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 12, right: 16, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={25} /><YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="requests" name="Requests" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={24} /><Line type="monotone" dataKey="accepted" name="Accepted" stroke="var(--success)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /><Line type="monotone" dataKey="replies" name="Replies" stroke="var(--warning)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div> : <div className="empty-state"><h3>No activity in this range</h3><p>Log your first connection request, then check back for a trend.</p></div>}</div></section>

    <div className={styles.tableGrid}><section className={styles.section}><div className={styles.heading}><div><h2 className="section-title">By profile</h2><p>Compare each LinkedIn account</p></div></div><div className="card"><MetricsTable rows={data.byProfile} firstLabel="Profile" empty="Add a profile to see its activity here." /></div></section><section className={styles.section}><div className={styles.heading}><div><h2 className="section-title">By country</h2><p>Sorted by reply rate</p></div></div><div className="card"><MetricsTable rows={data.byCountry} firstLabel="Country" empty="Country results appear after you log outreach activity." /></div></section></div>

    <section className={styles.section}><div className={styles.heading}><div><h2 className="section-title">When replies arrived</h2><p>First reply after each message stage</p></div></div><div className={`card ${styles.effectiveness}`}>{([
      ["After first message", data.replyAfter.firstMessage],
      ["After follow-up 1", data.replyAfter.followUp1],
      ["After follow-up 2", data.replyAfter.followUp2],
    ] as const).map(([label, count]) => <div className={styles.effectRow} key={label}><span>{label}</span><div className={styles.effectTrack}><span style={{ width: `${totalReplies ? count / totalReplies * 100 : 0}%` }} /></div><strong className="tabular">{formatNumber(count)}</strong></div>)}<p className={styles.footnote}>Based on the first recorded reply for each lead in the selected period.</p></div></section>
  </div>;
}
