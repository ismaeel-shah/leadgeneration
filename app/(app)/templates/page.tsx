import { listProfiles } from "@/actions/profiles";
import { getSettings } from "@/actions/settings";
import { listTemplates } from "@/actions/templates";
import { TemplateManager } from "@/components/templates/template-manager";

export default async function TemplatesPage() {
  const [templates, profiles, settings] = await Promise.all([listTemplates(), listProfiles(), getSettings()]);
  return <TemplateManager initialTemplates={templates} profiles={profiles} countries={settings.countries} services={settings.services} />;
}
