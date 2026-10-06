import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  calendarDaysBetween,
  endOfDay,
  isDueToday,
  isOverdue,
  isStaleRequest,
  startOfDay,
} from "../lib/dates";

describe("timezone calendar days", () => {
  it("uses Karachi day boundaries rather than UTC boundaries", () => {
    const now = new Date("2026-10-06T20:00:00.000Z"); // 01:00 on 7 Oct in Karachi
    expect(startOfDay(now).toISOString()).toBe("2026-10-06T19:00:00.000Z");
    expect(endOfDay(now).toISOString()).toBe("2026-10-07T18:59:59.999Z");
    expect(isDueToday(new Date("2026-10-07T18:59:00.000Z"), now)).toBe(true);
    expect(isOverdue(new Date("2026-10-06T18:59:00.000Z"), now)).toBe(true);
  });

  it("adds three local days for a late Karachi follow-up", () => {
    const sent = new Date("2026-10-06T18:30:00.000Z"); // 23:30 local
    expect(addCalendarDays(sent, 3).toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });

  it("keeps wall-clock time when daylight saving begins", () => {
    const sent = new Date("2026-03-07T17:30:00.000Z"); // 12:30 EST
    const due = addCalendarDays(sent, 2, "America/New_York");
    expect(due.toISOString()).toBe("2026-03-09T16:30:00.000Z"); // 12:30 EDT
    expect(calendarDaysBetween(sent, due, "America/New_York")).toBe(2);
  });

  it("marks a request stale only after the configured local-day interval", () => {
    const sent = new Date("2026-10-01T18:30:00.000Z");
    expect(isStaleRequest(sent, new Date("2026-10-22T18:29:59.000Z"))).toBe(false);
    expect(isStaleRequest(sent, new Date("2026-10-22T18:30:01.000Z"))).toBe(true);
  });
});
