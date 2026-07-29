import { describe, it, expect } from 'vitest';
import { presetRange, matchPreset } from './dateRangePresets';

// A fixed reference so the assertions are stable: Wed 15 Jul 2026 (local).
const now = new Date(2026, 6, 15);

describe('presetRange', () => {
  it('today / yesterday are single inclusive days', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-07-15', to: '2026-07-15' });
    expect(presetRange('yesterday', now)).toEqual({ from: '2026-07-14', to: '2026-07-14' });
  });

  it('last 7 days is a 7-day window ending today', () => {
    expect(presetRange('last7', now)).toEqual({ from: '2026-07-09', to: '2026-07-15' });
  });

  it('this month is the whole calendar month', () => {
    expect(presetRange('thisMonth', now)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('last month is the whole previous calendar month, handling year/length boundaries', () => {
    expect(presetRange('lastMonth', now)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    // January → previous December of the prior year.
    expect(presetRange('lastMonth', new Date(2026, 0, 10))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    // March → February, non-leap.
    expect(presetRange('lastMonth', new Date(2026, 2, 10))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('matchPreset', () => {
  it('recognises a range produced by a preset', () => {
    expect(matchPreset('2026-07-15', '2026-07-15', now)).toBe('today');
    expect(matchPreset('2026-07-01', '2026-07-31', now)).toBe('thisMonth');
  });

  it('returns null for a custom range or an empty one', () => {
    expect(matchPreset('2026-07-03', '2026-07-19', now)).toBeNull();
    expect(matchPreset('', '', now)).toBeNull();
    expect(matchPreset('2026-07-15', '', now)).toBeNull();
  });
});
