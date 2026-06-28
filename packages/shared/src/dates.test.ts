import { describe, expect, it } from 'vitest';
import {
  daysInPeriod,
  formatPeriod,
  getFiscalYear,
  overlapDays,
  parsePeriod,
  splitIntoMonths,
} from './dates';

describe('dates.getFiscalYear', () => {
  it('Apr 1 2024 belongs to FY2024-25', () => {
    const fy = getFiscalYear('2024-04-01');
    expect(fy.fyLabel).toBe('FY2024-25');
    expect(fy.year).toBe(2024);
    expect(fy.startsAt.toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(fy.endsAt.toISOString()).toBe('2025-03-31T23:59:59.999Z');
  });

  it('Mar 31 2024 belongs to FY2023-24', () => {
    const fy = getFiscalYear('2024-03-31');
    expect(fy.fyLabel).toBe('FY2023-24');
  });
});

describe('dates.parsePeriod', () => {
  it('parses FY2024-25', () => {
    const p = parsePeriod('FY2024-25');
    expect(p.start.toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2025-03-31T23:59:59.999Z');
  });

  it('parses Q1 FY2024-25 as Apr-Jun 2024', () => {
    const p = parsePeriod('Q1 FY2024-25');
    expect(p.start.toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2024-06-30T23:59:59.999Z');
  });

  it('parses "Apr 2024"', () => {
    const p = parsePeriod('Apr 2024');
    expect(p.start.toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2024-04-30T23:59:59.999Z');
  });

  it('parses ISO date range', () => {
    const p = parsePeriod('2024-04-01..2024-04-30');
    expect(daysInPeriod(p.start, p.end)).toBe(30);
  });
});

describe('dates utilities', () => {
  it('daysInPeriod is inclusive', () => {
    const p = parsePeriod('2024-04-01..2024-04-01');
    expect(daysInPeriod(p.start, p.end)).toBe(1);
  });

  it('overlapDays', () => {
    const a = parsePeriod('2024-04-01..2024-04-30');
    const b = parsePeriod('2024-04-15..2024-05-15');
    expect(overlapDays(a, b)).toBe(16);
  });

  it('splitIntoMonths buckets across month boundaries', () => {
    const p = parsePeriod('2024-04-15..2024-06-10');
    const months = splitIntoMonths(p.start, p.end);
    expect(months).toHaveLength(3);
    expect(months[0]?.month).toBe(4);
    expect(months[2]?.month).toBe(6);
  });

  it('formatPeriod is inverse-ish of parsePeriod', () => {
    const p = parsePeriod('2024-04-01..2024-04-30');
    expect(formatPeriod(p.start, p.end)).toBe('2024-04-01..2024-04-30');
  });
});
