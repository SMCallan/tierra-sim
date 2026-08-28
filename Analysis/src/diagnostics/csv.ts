/**
 * Deterministic CSV emission and strict CSV parsing.
 *
 * Implements §8 of the SCI-001 post-v8 diagnostic audit specification:
 * stable column order, stable row order, `\n` endings, RFC 4180 quoting, fixed numeric
 * formatting, and no timestamps or absolute paths.
 */

/** The literal token written when a quantity has no defined value (specification §4.6). */
export const UNDEFINED_TOKEN = 'undefined';

export type CellValue = string | number | boolean | null | undefined;

export type NumberFormat = 'ratio' | 'rate' | 'integer';

/** Decimal places per declared numeric kind (specification §8). */
const DECIMALS: Record<NumberFormat, number> = {
  ratio: 6,
  rate: 4,
  integer: 0,
};

/**
 * Formats a number for output.
 *
 * Non-finite values are a programming error here, not data: a zero denominator must have been
 * resolved to an explicit undefined reason before reaching the writer (specification §4.6).
 */
export const formatNumber = (value: number, format: NumberFormat): string => {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Refusing to write non-finite value ${String(value)}; zero denominators must be resolved to an explicit undefined reason`,
    );
  }
  return value.toFixed(DECIMALS[format]);
};

const needsQuoting = (field: string): boolean =>
  field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r');

export const escapeField = (value: CellValue): string => {
  if (value === null || value === undefined) {
    return UNDEFINED_TOKEN;
  }
  const text = typeof value === 'boolean' ? String(value) : String(value);
  return needsQuoting(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export type CsvRow = Record<string, CellValue>;

/**
 * Renders rows as CSV text.
 *
 * Columns are taken from `columns` only; a key present in a row but absent from `columns` is a
 * defect and throws, so a silently dropped field cannot reach a governed output.
 */
export const renderCsv = (columns: readonly string[], rows: readonly CsvRow[]): string => {
  const known = new Set(columns);
  const lines: string[] = [columns.map((column) => escapeField(column)).join(',')];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!known.has(key)) {
        throw new Error(`Row contains column "${key}" that is not declared in the header`);
      }
    }
    lines.push(columns.map((column) => escapeField(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
};

/**
 * Parses RFC 4180 CSV text into records.
 *
 * Strict by intent: a row whose field count differs from the header is a fatal registry defect,
 * not something to pad or truncate.
 */
export const parseCsv = (text: string): Array<Record<string, string>> => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  let index = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index] as string;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      endField();
      index += 1;
      continue;
    }
    if (char === '\r') {
      index += 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }
  if (quoted) {
    throw new Error('CSV ended inside a quoted field');
  }
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  const header = rows.shift();
  if (header === undefined) {
    throw new Error('CSV contains no header row');
  }
  return rows.map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} has ${values.length} fields but the header declares ${header.length}`,
      );
    }
    const record: Record<string, string> = {};
    header.forEach((name, columnIndex) => {
      record[name] = values[columnIndex] as string;
    });
    return record;
  });
};
