import { getAccount, getSettings } from "@/actions/settings";
import { SettingsView } from "@/components/settings/settings-view";

export const runtime = "nodejs";

export default async function SettingsPage() {
  const [settings, account] = await Promise.all([getSettings(), getAccount()]);
  return <SettingsView key={JSON.stringify(settings)} settings={settings} account={account} />;
}
