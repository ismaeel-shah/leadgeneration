import { describe, expect, it } from "vitest";
import { fillTemplate, matchTemplates, type MatchableTemplate } from "../lib/templates";

const templates: Array<MatchableTemplate & { name: string }> = [
  { name: "default", type: "first_message", isDefault: true, body: "default" },
  { name: "country", type: "first_message", country: "GB", body: "country" },
  { name: "service", type: "first_message", service: "Recruiting", body: "service" },
  { name: "both 1", type: "first_message", country: "gb", service: "recruiting", body: "both" },
  { name: "both 2", type: "first_message", country: "GB", service: "Recruiting", body: "both" },
  { name: "different type", type: "follow_up_1", isDefault: true, body: "follow up" },
];

describe("template matching", () => {
  it("prefers both criteria and returns ties for a picker", () => {
    expect(matchTemplates(templates, "first_message", { country: "GB", service: "Recruiting" }).map((item) => item.name))
      .toEqual(["both 1", "both 2"]);
  });

  it("prefers service, then country, then default", () => {
    expect(matchTemplates(templates, "first_message", { country: "US", service: "Recruiting" })[0]?.name).toBe("service");
    expect(matchTemplates(templates, "first_message", { country: "GB", service: "Design" })[0]?.name).toBe("country");
    expect(matchTemplates(templates, "first_message", { country: "US", service: "Design" })[0]?.name).toBe("default");
  });

  it("fills known placeholders and leaves unknown ones visible", () => {
    expect(fillTemplate(
      "Hi {{firstName}} at {{company}}. I'm {{myName}} from {{country}}. {{unknown}}",
      { fullName: "Ahmed Khan", company: "Acme", countryName: "United Kingdom" },
      { name: "Ali – UK" },
    )).toBe("Hi Ahmed at Acme. I'm Ali from United Kingdom. {{unknown}}");
  });
});
