import * as XLSX from 'xlsx';
import {
  EXAM_SLOT_CAPACITY_DEFAULT,
  EXAM_SLOT_COUNT,
  normalizeRoll,
  splitCsvLine,
  type ExamSlotRosterEntry,
} from '@/lib/exam-schedule-slots';

export type ParsedRosterSheet = {
  headers: string[];
  rows: string[][];
  fileName: string;
};

export type RosterColumnKey =
  | 'roll_number'
  | 'student_name'
  | 'email'
  | 'branch'
  | 'academic_year'
  | 'password'
  | 'slot_number';

export type RosterColumnMapping = Partial<Record<RosterColumnKey, string>>;

export const ROSTER_COLUMN_FIELDS: Array<{
  key: RosterColumnKey;
  label: string;
  required: boolean;
}> = [
  { key: 'roll_number', label: 'Roll number', required: true },
  { key: 'student_name', label: 'Student name', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'branch', label: 'Department / branch', required: false },
  { key: 'academic_year', label: 'Academic year', required: false },
  { key: 'password', label: 'Password', required: false },
  { key: 'slot_number', label: 'Slot number (auto-assign rows)', required: false },
];

const COLUMN_ALIASES: Record<RosterColumnKey, string[]> = {
  roll_number: ['roll', 'rollnumber', 'rollno', 'registration', 'htno', 'hallticket', 'regno'],
  student_name: ['name', 'fullname', 'studentname', 'student', 'candidate'],
  email: ['email', 'mail', 'emailid', 'emailaddress'],
  branch: ['department', 'dept', 'branch', 'specialization'],
  academic_year: ['year', 'academicyear', 'batch', 'classyear'],
  password: ['password', 'pass', 'pwd', 'loginpassword'],
  slot_number: ['slot', 'slotnumber', 'slotno', 'examslot', 'session'],
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function headerIndex(headers: string[], selected: string | undefined): number {
  if (!selected) return -1;
  return headers.indexOf(selected);
}

function uniquifyHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((raw, index) => {
    const base = raw.trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

export function guessRosterColumnMapping(headers: string[]): RosterColumnMapping {
  const mapping: RosterColumnMapping = {};
  const used = new Set<string>();

  for (const field of ROSTER_COLUMN_FIELDS) {
    for (const header of headers) {
      if (used.has(header)) continue;
      const normalized = normalizeHeader(header);
      if (COLUMN_ALIASES[field.key].some((alias) => normalized.includes(alias))) {
        mapping[field.key] = header;
        used.add(header);
        break;
      }
    }
  }

  return mapping;
}

export function normalizeSlotNumber(value: string): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/(\d+)/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num < 1 || num > EXAM_SLOT_COUNT) return null;
  return Math.floor(num);
}

export function parseCsvText(text: string, fileName = 'upload.csv'): ParsedRosterSheet {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { headers: [], rows: [], fileName };
  }

  const parsedLines = lines.map((line) => splitCsvLine(line));
  const first = parsedLines[0] ?? [];
  const guessed = guessRosterColumnMapping(first);
  const hasHeader = Object.keys(guessed).length > 0;

  if (hasHeader) {
    const headers = uniquifyHeaders(first.map((value, index) => value || `Column ${index + 1}`));
    const rows = parsedLines.slice(1).filter((row) => row.some((cell) => cell.trim()));
    return { headers, rows, fileName };
  }

  const headers = uniquifyHeaders(first.map((_, index) => `Column ${index + 1}`));
  return { headers, rows: parsedLines.filter((row) => row.some((cell) => cell.trim())), fileName };
}

export function parseWorkbookArrayBuffer(buffer: ArrayBuffer, fileName: string): ParsedRosterSheet {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], fileName };
  }

  const worksheet = workbook.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  const normalized = matrix
    .map((row) => (Array.isArray(row) ? row.map(cellValue) : []))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (normalized.length === 0) {
    return { headers: [], rows: [], fileName };
  }

  const first = normalized[0] ?? [];
  const guessed = guessRosterColumnMapping(first);
  const hasHeader = Object.keys(guessed).length > 0;

  if (hasHeader) {
    const headers = uniquifyHeaders(first.map((value, index) => value || `Column ${index + 1}`));
    const rows = normalized.slice(1);
    return { headers, rows, fileName };
  }

  const width = Math.max(...normalized.map((row) => row.length));
  const headers = uniquifyHeaders(Array.from({ length: width }, (_, index) => `Column ${index + 1}`));
  return { headers, rows: normalized, fileName };
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedRosterSheet> {
  const fileName = file.name;
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = await file.text();
    return parseCsvText(text, fileName);
  }

  const buffer = await file.arrayBuffer();
  return parseWorkbookArrayBuffer(buffer, fileName);
}

function readMappedCell(row: string[], headers: string[], column?: string): string | undefined {
  const index = headerIndex(headers, column);
  if (index < 0) return undefined;
  const value = row[index]?.trim();
  return value || undefined;
}

function rowToRosterEntry(row: string[], headers: string[], mapping: RosterColumnMapping): ExamSlotRosterEntry | null {
  const roll = normalizeRoll(readMappedCell(row, headers, mapping.roll_number) ?? '');
  if (!roll) return null;

  return {
    roll_number: roll,
    student_name: readMappedCell(row, headers, mapping.student_name),
    email: readMappedCell(row, headers, mapping.email),
    branch: readMappedCell(row, headers, mapping.branch),
    academic_year: readMappedCell(row, headers, mapping.academic_year),
    password: readMappedCell(row, headers, mapping.password),
  };
}

export type SlotRosterImportResult = {
  bySlot: Map<number, ExamSlotRosterEntry[]>;
  skipped: number;
  warnings: string[];
};

export function buildSlotRosterImport(
  sheet: ParsedRosterSheet,
  mapping: RosterColumnMapping,
  options: {
    mode: 'single_slot' | 'slot_column';
    targetSlot?: number;
    replaceExisting?: boolean;
    defaultPassword?: string;
  },
): SlotRosterImportResult {
  if (!mapping.roll_number) {
    throw new Error('Select the roll number column before importing.');
  }

  const defaultPassword = options.defaultPassword?.trim() || '';

  const bySlot = new Map<number, ExamSlotRosterEntry[]>();
  const seenBySlot = new Map<number, Set<string>>();
  let skipped = 0;
  const warnings: string[] = [];

  for (const row of sheet.rows) {
    const entry = rowToRosterEntry(row, sheet.headers, mapping);
    if (!entry) {
      skipped += 1;
      continue;
    }

    let slotNumber: number | null = null;
    if (options.mode === 'slot_column') {
      slotNumber = normalizeSlotNumber(readMappedCell(row, sheet.headers, mapping.slot_number) ?? '');
      if (slotNumber == null) {
        skipped += 1;
        warnings.push(`Skipped ${entry.roll_number}: missing or invalid slot number.`);
        continue;
      }
    } else {
      slotNumber = options.targetSlot ?? null;
      if (slotNumber == null) {
        throw new Error('Select a slot to assign imported students.');
      }
    }

    const seen = seenBySlot.get(slotNumber) ?? new Set<string>();
    if (seen.has(entry.roll_number)) {
      skipped += 1;
      continue;
    }
    seen.add(entry.roll_number);
    seenBySlot.set(slotNumber, seen);

    const list = bySlot.get(slotNumber) ?? [];
    list.push({
      ...entry,
      password: entry.password || defaultPassword || undefined,
    });
    bySlot.set(slotNumber, list);
  }

  for (const [slotNumber, roster] of bySlot.entries()) {
    if (roster.length > EXAM_SLOT_CAPACITY_DEFAULT) {
      warnings.push(
        `Slot ${slotNumber} has ${roster.length} students. Only the first ${EXAM_SLOT_CAPACITY_DEFAULT} will be kept.`,
      );
      bySlot.set(slotNumber, roster.slice(0, EXAM_SLOT_CAPACITY_DEFAULT));
    }
  }

  if (bySlot.size === 0) {
    throw new Error('No valid student rows found. Check your column mapping and sheet data.');
  }

  return { bySlot, skipped, warnings };
}

export function previewMappedRosterRows(
  sheet: ParsedRosterSheet,
  mapping: RosterColumnMapping,
  limit = 5,
): ExamSlotRosterEntry[] {
  const out: ExamSlotRosterEntry[] = [];
  for (const row of sheet.rows) {
    const entry = rowToRosterEntry(row, sheet.headers, mapping);
    if (!entry) continue;
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}
