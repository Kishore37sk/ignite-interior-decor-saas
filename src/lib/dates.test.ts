import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  daysRemaining,
  deadlineInfo,
  formatDate,
  formatDateTime,
  formatMonth,
  greetingForTime,
  isDateOnly,
  parseDateOnly,
  relativeTime,
  requiredDateInfo,
  resolveDateRange,
  todayIST,
  toDateOnly,
} from "./dates";

describe("todayIST", () => {
  it("rolls over at IST midnight, not UTC midnight", () => {
    // 18:29:59Z = 23:59:59 IST on 7 Oct
    expect(todayIST(new Date("2026-10-07T18:29:59Z"))).toBe("2026-10-07");
    // 18:30:00Z = 00:00 IST on 8 Oct, while UTC is still 7 Oct
    expect(todayIST(new Date("2026-10-07T18:30:00Z"))).toBe("2026-10-08");
  });

  it("is independent of the process timezone (tests run in America/New_York)", () => {
    // 02:00 IST on 1 Jan is still 31 Dec in New York.
    expect(todayIST(new Date("2025-12-31T20:30:00Z"))).toBe("2026-01-01");
  });
});

describe("isDateOnly / parseDateOnly", () => {
  it("accepts real calendar dates only", () => {
    expect(isDateOnly("2026-10-08")).toBe(true);
    expect(isDateOnly("2028-02-29")).toBe(true);
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2026-13-01")).toBe(false);
    expect(isDateOnly("08-10-2026")).toBe(false);
    expect(isDateOnly("2026-10-08T00:00:00Z")).toBe(false);
    expect(isDateOnly(null)).toBe(false);
  });

  it("never shifts the calendar day", () => {
    const date = parseDateOnly("2026-10-08");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(8);
    expect(parseDateOnly("nope")).toBeNull();
  });
});

describe("toDateOnly", () => {
  it("passes date-only strings through and converts instants to the IST date", () => {
    expect(toDateOnly("2026-10-08")).toBe("2026-10-08");
    expect(toDateOnly("2026-10-07T19:00:00Z")).toBe("2026-10-08");
    expect(toDateOnly("")).toBeNull();
    expect(toDateOnly("garbage")).toBeNull();
  });
});

describe("day arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-10-08", "2026-10-20")).toBe(12);
    expect(daysBetween("2026-10-08", "2026-10-03")).toBe(-5);
    expect(daysBetween("2026-10-08", null)).toBeNull();
  });

  it("computes days remaining from an explicit today", () => {
    expect(daysRemaining("2026-10-20", "2026-10-08")).toBe(12);
    expect(daysRemaining(null, "2026-10-08")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats dates as dd MMM yyyy", () => {
    expect(formatDate("2026-10-08")).toBe("08 Oct 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined, "Not set")).toBe("Not set");
  });

  it("formats instants in IST", () => {
    expect(formatDateTime("2026-10-08T05:02:00Z")).toBe("08 Oct 2026, 10:32 AM");
    expect(formatDateTime("2026-10-07T18:45:00Z")).toBe("08 Oct 2026, 12:15 AM");
    expect(formatDateTime("2026-10-08T07:30:00Z")).toBe("08 Oct 2026, 01:00 PM");
  });

  it("formats months", () => {
    expect(formatMonth("2026-10")).toBe("Oct 2026");
    expect(formatMonth("2026-01-15")).toBe("Jan 2026");
  });
});

describe("greetingForTime", () => {
  it("uses the IST hour", () => {
    expect(greetingForTime(new Date("2026-10-08T03:00:00Z"))).toBe("Good Morning"); // 08:30 IST
    expect(greetingForTime(new Date("2026-10-08T08:00:00Z"))).toBe("Good Afternoon"); // 13:30 IST
    expect(greetingForTime(new Date("2026-10-08T14:00:00Z"))).toBe("Good Evening"); // 19:30 IST
  });
});

describe("deadlineInfo", () => {
  const today = "2026-10-08";

  it("labels remaining days", () => {
    expect(deadlineInfo("2026-10-20", "execution", today)).toMatchObject({
      state: "due_14",
      label: "12 days remaining",
      days: 12,
    });
    expect(deadlineInfo("2026-12-31", "execution", today)).toMatchObject({ state: "on_track", tone: "success" });
    expect(deadlineInfo("2026-10-15", "design", today)).toMatchObject({ state: "due_7", tone: "warning" });
    expect(deadlineInfo("2026-10-30", "design", today).state).toBe("due_30");
  });

  it("handles today, tomorrow and overdue", () => {
    expect(deadlineInfo("2026-10-08", "finishing", today)).toMatchObject({ state: "due_today", label: "Due today" });
    expect(deadlineInfo("2026-10-09", "finishing", today)).toMatchObject({
      state: "due_tomorrow",
      label: "Due tomorrow",
    });
    expect(deadlineInfo("2026-10-03", "execution", today)).toMatchObject({
      state: "overdue",
      label: "Overdue by 5 days",
      tone: "danger",
      days: -5,
    });
    expect(deadlineInfo("2026-10-07", "execution", today).label).toBe("Overdue by 1 day");
  });

  it("ignores the deadline for closed projects and missing dates", () => {
    expect(deadlineInfo("2026-10-03", "completed", today)).toMatchObject({ state: "completed", label: "Completed" });
    expect(deadlineInfo("2026-10-03", "cancelled", today).state).toBe("cancelled");
    expect(deadlineInfo(null, "planning", today)).toMatchObject({ state: "no_date", label: "No deadline" });
  });

  it("treats a deadline as due today right after IST midnight", () => {
    // 00:05 IST on 8 Oct (still 7 Oct in UTC).
    const istToday = todayIST(new Date("2026-10-07T18:35:00Z"));
    expect(deadlineInfo("2026-10-08", "execution", istToday).state).toBe("due_today");
    expect(deadlineInfo("2026-10-07", "execution", istToday).label).toBe("Overdue by 1 day");
  });
});

describe("requiredDateInfo", () => {
  const today = "2026-10-08";

  it("labels open requests", () => {
    expect(requiredDateInfo("2026-10-15", "requested", today)).toMatchObject({
      state: "due_soon",
      label: "Required in 7 days",
    });
    expect(requiredDateInfo("2026-10-25", "approved", today)).toMatchObject({ state: "upcoming" });
    expect(requiredDateInfo("2026-10-09", "ordered", today).label).toBe("Due tomorrow");
    expect(requiredDateInfo("2026-10-08", "ordered", today).label).toBe("Due today");
    expect(requiredDateInfo("2026-10-06", "pending_review", today)).toMatchObject({
      state: "overdue",
      label: "Overdue by 2 days",
    });
  });

  it("marks closed requests", () => {
    expect(requiredDateInfo("2026-10-01", "delivered", today)).toMatchObject({
      state: "closed",
      label: "Delivered",
      tone: "success",
    });
    expect(requiredDateInfo("2026-10-01", "rejected", today).label).toBe("Rejected");
  });
});

describe("resolveDateRange", () => {
  const today = "2026-10-08"; // Thursday

  it("resolves presets", () => {
    expect(resolveDateRange("today", null, null, today)).toEqual({ from: today, to: today });
    expect(resolveDateRange("this_week", null, null, today)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(resolveDateRange("this_month", null, null, today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    // 7 / 30 calendar days including today.
    expect(resolveDateRange("next_7", null, null, today)).toEqual({ from: today, to: "2026-10-14" });
    expect(resolveDateRange("next_30", null, null, today)).toEqual({ from: today, to: "2026-11-06" });
  });

  it("validates and orders custom ranges", () => {
    expect(resolveDateRange("custom", "2026-10-20", "2026-10-01", today)).toEqual({
      from: "2026-10-01",
      to: "2026-10-20",
    });
    expect(resolveDateRange("custom", "bad", "2026-10-01", today)).toEqual({ from: null, to: "2026-10-01" });
    expect(resolveDateRange(undefined, null, null, today)).toEqual({ from: null, to: null });
  });

  it("handles a Sunday as the end of the week", () => {
    expect(resolveDateRange("this_week", null, null, "2026-10-11")).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    });
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-08T06:00:00Z");

  it("describes recent instants", () => {
    expect(relativeTime("2026-10-08T05:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-08T05:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-10-08T03:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-10-07T05:00:00Z", now)).toBe("Yesterday");
    expect(relativeTime("2026-10-04T05:00:00Z", now)).toBe("4 days ago");
    expect(relativeTime("2026-09-01T05:00:00Z", now)).toBe("01 Sep 2026");
    expect(relativeTime(null, now)).toBe("—");
  });
});
