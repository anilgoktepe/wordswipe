/**
 * scripts/generate-vocabulary.ts
 *
 * Content pipeline: reads content/vocabulary.csv and rewrites the vocabulary
 * array section in src/data/vocabulary.ts.
 *
 * ─── What it does ─────────────────────────────────────────────────────────────
 *
 *   1. Parses content/vocabulary.csv (UTF-8, quoted-field safe)
 *   2. Validates all required fields and known enum values
 *   3. Detects duplicate words (normalizeWordKey)
 *   4. Auto-assigns IDs to rows with id=auto
 *   5. Reports level + partOfSpeech + topic coverage
 *   6. Replaces only the VOCABULARY DATA block in vocabulary.ts
 *   7. Exits with code 1 on any error — safe to use in CI
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *
 *   npm run vocab:generate          — dry-run: validate + print report
 *   npm run vocab:generate -- --write  — validate + write vocabulary.ts
 *
 * ─── Pipeline ─────────────────────────────────────────────────────────────────
 *
 *   content/vocabulary.csv
 *     ↓  npm run vocab:generate -- --write
 *   src/data/vocabulary.ts  (array section only — types/helpers untouched)
 *     ↓  npm run validate:vocab
 *   clean? → commit → release
 */

import * as fs   from 'fs';
import * as path from 'path';

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT       = path.join(__dirname, '..');
const CSV_PATH   = path.join(ROOT, 'content', 'vocabulary.csv');
const VOCAB_PATH = path.join(ROOT, 'src', 'data', 'vocabulary.ts');

const BLOCK_START = '// ─── VOCABULARY DATA START';
const BLOCK_END   = '// ─── VOCABULARY DATA END';

// ─── Known enum values ────────────────────────────────────────────────────────

const VALID_LEVELS:  Set<string> = new Set(['easy', 'medium', 'hard']);
const VALID_CEFR:    Set<string> = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const VALID_POS:     Set<string> = new Set(['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']);
const VALID_TOPICS:  Set<string> = new Set([
  'daily', 'academic', 'business', 'nature', 'social',
  'emotions', 'travel', 'health', 'technology', 'education',
]);

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

interface CSVRow {
  id:           string;
  word:         string;
  translation:  string;
  example:      string;
  level:        string;
  cefrLevel:    string;
  partOfSpeech: string;
  topic:        string;
}

function parseCSV(content: string): CSVRow[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    rows.push(row as unknown as CSVRow);
  }

  return rows;
}

// ─── Normalize ────────────────────────────────────────────────────────────────

function normalizeWordKey(word: string): string {
  return word.toLowerCase().trim();
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface ParsedWord {
  id:            number | 'auto';
  word:          string;
  translation:   string;
  example:       string;
  level:         'easy' | 'medium' | 'hard';
  cefrLevel?:    string;
  partOfSpeech?: string;
  topic?:        string;
}

interface ValidationResult {
  words:    ParsedWord[];
  errors:   string[];
  warnings: string[];
}

function validateRows(rows: CSVRow[]): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  const words:    ParsedWord[] = [];
  const seenKeys  = new Map<string, number>(); // normalizedKey → row index
  const seenIds   = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const row = i + 2; // 1-based + header row
    const ctx = `Row ${row} ("${r.word || '?'}")`;

    // Required fields
    if (!r.word?.trim()) {
      errors.push(`${ctx}: "word" is required.`);
      continue;
    }
    if (!r.translation?.trim()) {
      errors.push(`${ctx}: "translation" is required.`);
    }
    if (!r.example?.trim() || r.example.trim().length < 8) {
      errors.push(`${ctx}: "example" must be at least 8 characters.`);
    }
    if (!VALID_LEVELS.has(r.level)) {
      errors.push(`${ctx}: "level" must be easy | medium | hard. Got: "${r.level}".`);
    }

    // ID
    let id: number | 'auto';
    if (!r.id || r.id === 'auto') {
      id = 'auto';
    } else {
      const parsed = parseInt(r.id, 10);
      if (isNaN(parsed) || parsed < 1) {
        errors.push(`${ctx}: "id" must be a positive integer or "auto". Got: "${r.id}".`);
        id = 'auto';
      } else if (seenIds.has(parsed)) {
        errors.push(`${ctx}: duplicate id ${parsed}.`);
        id = 'auto';
      } else {
        seenIds.add(parsed);
        id = parsed;
      }
    }

    // Duplicate word check
    const key = normalizeWordKey(r.word);
    if (seenKeys.has(key)) {
      errors.push(`${ctx}: duplicate word "${r.word}" (conflicts with row ${seenKeys.get(key)! + 2}).`);
    } else {
      seenKeys.set(key, i);
    }

    // Optional fields — warn on unknown values
    if (r.cefrLevel && !VALID_CEFR.has(r.cefrLevel)) {
      warnings.push(`${ctx}: unknown cefrLevel "${r.cefrLevel}" — will be omitted.`);
    }
    if (r.partOfSpeech && !VALID_POS.has(r.partOfSpeech)) {
      warnings.push(`${ctx}: unknown partOfSpeech "${r.partOfSpeech}" — will be omitted.`);
    }
    if (r.topic && !VALID_TOPICS.has(r.topic)) {
      warnings.push(`${ctx}: unknown topic "${r.topic}" — will be omitted.`);
    }

    words.push({
      id,
      word:         r.word.trim(),
      translation:  r.translation.trim(),
      example:      r.example.trim(),
      level:        r.level as 'easy' | 'medium' | 'hard',
      cefrLevel:    VALID_CEFR.has(r.cefrLevel)    ? r.cefrLevel    : undefined,
      partOfSpeech: VALID_POS.has(r.partOfSpeech)   ? r.partOfSpeech : undefined,
      topic:        VALID_TOPICS.has(r.topic)        ? r.topic        : undefined,
    });
  }

  return { words, errors, warnings };
}

// ─── ID assignment ────────────────────────────────────────────────────────────

function assignIds(words: ParsedWord[]): (ParsedWord & { id: number })[] {
  const usedIds = new Set(
    words.filter(w => w.id !== 'auto').map(w => w.id as number),
  );

  let nextId = 1;
  const advance = () => {
    while (usedIds.has(nextId)) nextId++;
    usedIds.add(nextId);
    return nextId++;
  };

  return words.map(w => ({
    ...w,
    id: w.id === 'auto' ? advance() : w.id,
  })) as (ParsedWord & { id: number })[];
}

// ─── Code generation ──────────────────────────────────────────────────────────

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function wordToLine(w: ParsedWord & { id: number }): string {
  const parts: string[] = [
    `id: ${w.id}`,
    `word: '${escapeStr(w.word)}'`,
    `translation: '${escapeStr(w.translation)}'`,
    `example: '${escapeStr(w.example)}'`,
    `level: '${w.level}'`,
  ];
  if (w.cefrLevel)    parts.push(`cefrLevel: '${w.cefrLevel}'`);
  if (w.partOfSpeech) parts.push(`partOfSpeech: '${w.partOfSpeech}'`);
  if (w.topic)        parts.push(`topic: '${w.topic}'`);

  return `  { ${parts.join(', ')} },`;
}

function generateBlock(words: (ParsedWord & { id: number })[]): string {
  const easy   = words.filter(w => w.level === 'easy');
  const medium = words.filter(w => w.level === 'medium');
  const hard   = words.filter(w => w.level === 'hard');

  const lines: string[] = [
    `// ─── VOCABULARY DATA START ────────────────────────────────────────────────────`,
    `// This block is managed by scripts/generate-vocabulary.ts.`,
    `// Edit content/vocabulary.csv, then run: npm run vocab:generate -- --write`,
    `// Do not edit this section by hand — your changes will be overwritten.`,
    `// ──────────────────────────────────────────────────────────────────────────────`,
    `export const vocabulary: Word[] = [`,
    `  // ===== EASY WORDS (A1-A2) =====`,
    ...easy.map(wordToLine),
    ``,
    `  // ===== MEDIUM WORDS (B1-B2) =====`,
    ...medium.map(wordToLine),
    ``,
    `  // ===== HARD WORDS (C1-C2) =====`,
    ...hard.map(wordToLine),
    `];`,
    `// ─── VOCABULARY DATA END ──────────────────────────────────────────────────────`,
  ];

  return lines.join('\n');
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printReport(
  words:    (ParsedWord & { id: number })[],
  errors:   string[],
  warnings: string[],
): void {
  const hr = '─'.repeat(60);
  console.log(`\n${hr}`);
  console.log('  WordSwipe — Vocabulary Generate Report');
  console.log(hr);

  // Counts
  const easy   = words.filter(w => w.level === 'easy').length;
  const medium = words.filter(w => w.level === 'medium').length;
  const hard   = words.filter(w => w.level === 'hard').length;
  console.log(`\n📦 Total words : ${words.length}`);
  console.log(`   easy        : ${easy}`);
  console.log(`   medium      : ${medium}`);
  console.log(`   hard        : ${hard}`);

  // POS coverage
  const withPOS   = words.filter(w => w.partOfSpeech).length;
  const withTopic = words.filter(w => w.topic).length;
  console.log(`\n📊 Metadata coverage`);
  console.log(`   partOfSpeech : ${withPOS} / ${words.length} (${pct(withPOS, words.length)})`);
  console.log(`   topic        : ${withTopic} / ${words.length} (${pct(withTopic, words.length)})`);

  // POS breakdown
  const posCounts: Record<string, number> = {};
  for (const w of words) {
    if (w.partOfSpeech) posCounts[w.partOfSpeech] = (posCounts[w.partOfSpeech] ?? 0) + 1;
  }
  if (Object.keys(posCounts).length > 0) {
    console.log(`\n   POS breakdown:`);
    for (const [pos, count] of Object.entries(posCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${pos.padEnd(12)}: ${count}`);
    }
  }

  // Warnings
  console.log(`\n${hr}`);
  if (warnings.length === 0) {
    console.log('✅ No warnings.');
  } else {
    console.log(`⚠️  Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`   ${w}`);
  }

  // Errors
  console.log(`\n${hr}`);
  if (errors.length === 0) {
    console.log('✅ No errors. Dataset is valid.');
  } else {
    console.log(`❌ Errors (${errors.length}):`);
    for (const e of errors) console.log(`   ${e}`);
  }

  console.log(`${hr}\n`);
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const WRITE_MODE = process.argv.includes('--write');

if (!fs.existsSync(CSV_PATH)) {
  console.error(`\n❌ CSV not found: ${CSV_PATH}`);
  console.error('   Create content/vocabulary.csv and try again.\n');
  process.exit(1);
}

const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
const rows       = parseCSV(csvContent);

if (rows.length === 0) {
  console.error('\n❌ CSV is empty or has no data rows.\n');
  process.exit(1);
}

const { words: rawWords, errors, warnings } = validateRows(rows);
const words = assignIds(rawWords);

printReport(words, errors, warnings);

if (errors.length > 0) {
  console.error('❌ Fix the errors above before writing vocabulary.ts\n');
  process.exit(1);
}

if (!WRITE_MODE) {
  console.log('ℹ️  Dry-run complete (no files written).');
  console.log('   Run with --write to update vocabulary.ts:\n');
  console.log('   npm run vocab:generate -- --write\n');
  process.exit(0);
}

// Read vocabulary.ts and replace only the guarded block
if (!fs.existsSync(VOCAB_PATH)) {
  console.error(`\n❌ vocabulary.ts not found: ${VOCAB_PATH}\n`);
  process.exit(1);
}

const existing = fs.readFileSync(VOCAB_PATH, 'utf-8');
const startIdx = existing.indexOf(BLOCK_START);
const endIdx   = existing.indexOf(BLOCK_END);

if (startIdx === -1 || endIdx === -1) {
  console.error('\n❌ Could not find VOCABULARY DATA START/END markers in vocabulary.ts.');
  console.error('   Make sure the file contains:\n');
  console.error(`   ${BLOCK_START}`);
  console.error(`   ...`);
  console.error(`   ${BLOCK_END}\n`);
  process.exit(1);
}

const before     = existing.slice(0, startIdx);
// Advance past the entire END line (not just the constant) to avoid
// accumulating trailing dashes on repeated runs.
const endLineEnd = existing.indexOf('\n', endIdx);
const after      = endLineEnd === -1 ? '' : existing.slice(endLineEnd);
const newBlock = generateBlock(words);
const output  = before + newBlock + after;

fs.writeFileSync(VOCAB_PATH, output, 'utf-8');

console.log(`✅ vocabulary.ts updated — ${words.length} words written.`);
console.log(`   Run 'npm run validate:vocab' to verify the output.\n`);
