import { describe, expect, it } from 'vitest';

import {
  escapeField,
  formatNumber,
  parseCsv,
  renderCsv,
  UNDEFINED_TOKEN,
} from '../../src/diagnostics/csv.ts';

describe('deterministic CSV rendering', () => {
  it('writes the declared column order and a trailing newline', () => {
    const csv = renderCsv(['b', 'a'], [{ a: 1, b: 2 }]);
    expect(csv).toBe('b,a\n2,1\n');
  });

  it('renders null and undefined as the explicit undefined token, never as blank or zero', () => {
    const csv = renderCsv(['value'], [{ value: null }, { value: undefined }, {}]);
    expect(csv).toBe(`value\n${UNDEFINED_TOKEN}\n${UNDEFINED_TOKEN}\n${UNDEFINED_TOKEN}\n`);
    expect(csv).not.toContain(',,');
  });

  it('quotes fields containing separators, quotes, or newlines', () => {
    expect(escapeField('plain')).toBe('plain');
    expect(escapeField('a,b')).toBe('"a,b"');
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeField('line\nbreak')).toBe('"line\nbreak"');
  });

  it('rejects a row carrying a column absent from the header', () => {
    expect(() => renderCsv(['a'], [{ a: 1, stray: 2 }])).toThrow(/not declared in the header/);
  });

  it('uses fixed decimal places per numeric kind', () => {
    expect(formatNumber(1 / 3, 'ratio')).toBe('0.333333');
    expect(formatNumber(1 / 3, 'rate')).toBe('0.3333');
    expect(formatNumber(12, 'integer')).toBe('12');
  });

  it('refuses to write a non-finite number rather than emitting NaN or Infinity', () => {
    expect(() => formatNumber(Number.NaN, 'ratio')).toThrow(/non-finite/);
    expect(() => formatNumber(Number.POSITIVE_INFINITY, 'rate')).toThrow(/non-finite/);
  });

  it('is byte-identical across repeated renders of the same input', () => {
    const rows = [{ a: 'x', b: 1 }, { a: 'y', b: 2 }];
    expect(renderCsv(['a', 'b'], rows)).toBe(renderCsv(['a', 'b'], rows));
  });
});

describe('strict CSV parsing', () => {
  it('round-trips quoted fields', () => {
    const csv = renderCsv(['a', 'b'], [{ a: 'x,y', b: 'say "hi"' }]);
    expect(parseCsv(csv)).toEqual([{ a: 'x,y', b: 'say "hi"' }]);
  });

  it('tolerates CRLF line endings in an input registry', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('rejects a row whose field count disagrees with the header', () => {
    expect(() => parseCsv('a,b\n1\n')).toThrow(/has 1 fields but the header declares 2/);
  });

  it('rejects text that ends inside a quoted field', () => {
    expect(() => parseCsv('a\n"unterminated\n')).toThrow(/inside a quoted field/);
  });
});
