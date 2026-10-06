export type TemplateType = "connection_note" | "first_message" | "follow_up_1" | "follow_up_2" | "other";

export type MatchableTemplate = {
  type: TemplateType;
  country?: string | null;
  service?: string | null;
  isDefault?: boolean;
  body: string;
};

export type TemplateLead = {
  fullName?: string | null;
  firstName?: string | null;
  company?: string | null;
  role?: string | null;
  country?: string | null;
  countryName?: string | null;
  service?: string | null;
};

export type TemplateProfile = { name?: string | null; myName?: string | null };

function key(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("en") ?? "";
}

/**
 * Returns every template at the best matching specificity. A caller can show a
 * picker if more than one template is returned.
 */
export function matchTemplates<T extends MatchableTemplate>(
  templates: readonly T[],
  type: TemplateType,
  lead: Pick<TemplateLead, "country" | "service">,
): T[] {
  const matching: Array<{ template: T; score: number }> = [];
  for (const template of templates) {
    if (template.type !== type) continue;
    const country = key(template.country);
    const service = key(template.service);
    if (country && country !== key(lead.country)) continue;
    if (service && service !== key(lead.service)) continue;

    let score: number;
    if (country && service) score = 3;
    else if (service) score = 2;
    else if (country) score = 1;
    else score = template.isDefault ? 0 : -1;
    matching.push({ template, score });
  }
  if (matching.length === 0) return [];
  const bestScore = Math.max(...matching.map(({ score }) => score));
  return matching.filter(({ score }) => score === bestScore).map(({ template }) => template);
}

export const matchingTemplates = matchTemplates;

export function fillTemplate(
  body: string,
  lead: TemplateLead,
  profile: TemplateProfile | string = {},
): string {
  const profileName = typeof profile === "string" ? profile : (profile.myName || profile.name || "");
  const myName = profileName.split(/\s+[–—-]\s+/)[0].trim();
  const fullName = lead.fullName?.trim() ?? "";
  const values: Record<string, string> = {
    firstName: lead.firstName?.trim() || fullName.split(/\s+/)[0] || "",
    fullName,
    company: lead.company?.trim() ?? "",
    role: lead.role?.trim() ?? "",
    country: lead.countryName?.trim() || lead.country?.trim() || "",
    service: lead.service?.trim() ?? "",
    myName,
  };
  return body.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : placeholder,
  );
}
