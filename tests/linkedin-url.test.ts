import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl, parseLinkedInProfileUrl } from "../lib/linkedin-url";

describe("LinkedIn profile URL normalization", () => {
  it.each([
    "https://www.linkedin.com/in/Ahmed-Khan-12ab/?trk=public_profile",
    "http://m.linkedin.com/in/ahmed-khan-12ab/",
    "linkedin.com/en/in/AHMED-KHAN-12AB?foo=1",
    "https://linkedin.com/en-us/in/ahmed-khan-12ab/",
    "https://mobile.linkedin.com/in/ahmed-khan-12ab/details/experience/",
  ])("normalizes %s", (url) => {
    expect(normalizeLinkedInUrl(url)).toBe("linkedin.com/in/ahmed-khan-12ab");
  });

  it("suggests a name without the LinkedIn identifier suffix", () => {
    expect(parseLinkedInProfileUrl("linkedin.com/in/ahmed-khan-12ab")?.suggestedName).toBe("Ahmed Khan");
    expect(parseLinkedInProfileUrl("linkedin.com/in/ahmed-khan-12ab")?.firstName).toBe("Ahmed");
  });

  it.each([
    "",
    "https://example.com/in/ahmed-khan",
    "https://evil.linkedin.com/in/ahmed-khan",
    "https://linkedin.com/company/acme",
    "https://linkedin.com/in/",
    "javascript://linkedin.com/in/ahmed-khan",
    "https://linkedin.com/in/a%2Fb",
  ])("rejects %s", (url) => {
    expect(normalizeLinkedInUrl(url)).toBeNull();
  });
});
