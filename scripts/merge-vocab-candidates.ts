/**
 * scripts/merge-vocab-candidates.ts
 *
 * Merges a validated candidate file into content/vocabulary.csv, then
 * regenerates vocabulary.ts and re-validates.
 *
 * Run: npm run merge:candidates -- content/candidates/vocab_batch_001.csv
 *
 * ─── Pipeline ─────────────────────────────────────────────────────────────────
 *
 *   1. Re-validate candidate file (all rules from validate-vocab-candidates)
 *   2. Find max existing ID in vocabulary.csv
 *   3. Assign sequential IDs to candidate rows
 *   4. Append rows to vocabulary.csv
 *   5. Run: npm run vocab:generate -- --write
 *   6. Run: npm run validate:vocab
 *   7. Print success report
 *
 * ─── Safety ───────────────────────────────────────────────────────────────────
 *
 *   - Never rewrites existing rows — append only
 *   - Exits 1 immediately on any validation error (step 1)
 *   - Prints a recovery command if steps 5–6 fail after the append
 *   - Does NOT commit — git is the rollback mechanism
 */

import * as fs            from 'fs';
import * as path          from 'path';
import { execSync }       from 'child_process';

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT     = path.join(__dirname, '..');
const MAIN_CSV = path.join(ROOT, 'content', 'vocabulary.csv');

// ─── Known enum values (mirrored from validate-vocab-candidates) ──────────────

const VALID_LEVELS:  Set<string> = new Set(['easy', 'medium', 'hard']);
const VALID_CEFR:    Set<string> = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const VALID_POS:     Set<string> = new Set(['noun', 'verb', 'adjective', 'adverb']);
const VALID_TOPICS:  Set<string> = new Set([
  'daily', 'academic', 'business', 'nature', 'social',
  'emotions', 'travel', 'health', 'technology', 'education',
]);

const CEFR_TO_LEVEL: Record<string, string> = {
  A1: 'easy', A2: 'easy',
  B1: 'medium', B2: 'medium',
  C1: 'hard', C2: 'hard',
};

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
  exampleTr:    string;
  level:        string;
  cefrLevel:    string;
  partOfSpeech: string;
  topic:        string;
  [key: string]: string;
}

function parseCSV(filePath: string): CSVRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines   = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    rows.push(row as CSVRow);
  }

  return rows;
}

// ─── CSV field escaper (mirrors generate-vocabulary.ts) ──────────────────────

function escapeCSVField(s: string): string {
  // Wrap in quotes if the field contains commas, quotes, or newlines
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCSVLine(row: CSVRow & { id: string }): string {
  return [
    row.id,
    row.word,
    row.translation,
    row.example,
    row.exampleTr,
    row.level,
    row.cefrLevel,
    row.partOfSpeech,
    row.topic,
  ].map(escapeCSVField).join(',');
}

// ─── Inline validation (defensive re-check before any mutation) ───────────────

function validateCandidates(
  candidateRows: CSVRow[],
  existingWords: Set<string>,
): string[] {
  const errors: string[] = [];
  const seenInFile = new Map<string, number>();

  for (let i = 0; i < candidateRows.length; i++) {
    const r   = candidateRows[i];
    const row = i + 2;
    const ctx = `Row ${row} ("${r.word || '?'}")`;

    if (r.id !== 'auto') errors.push(`${ctx}: id must be "auto". Got: "${r.id}".`);

    if (!r.word?.trim()) { errors.push(`${ctx}: "word" is required.`); continue; }
    if (r.word.trim().includes(' ')) errors.push(`${ctx}: word must be a single word.`);

    const key = r.word.toLowerCase().trim();
    if (seenInFile.has(key)) {
      errors.push(`${ctx}: duplicate word "${r.word}" within candidate file.`);
    } else {
      seenInFile.set(key, row);
    }
    if (existingWords.has(key)) {
      errors.push(`${ctx}: "${r.word}" already exists in vocabulary.csv.`);
    }

    if (!r.translation?.trim())        errors.push(`${ctx}: "translation" is required.`);
    else if (r.translation.includes('/')) errors.push(`${ctx}: slash in translation.`);
    else if (r.translation.includes('(')) errors.push(`${ctx}: parentheses in translation.`);

    if (!r.example?.trim() || r.example.trim().length < 8)
      errors.push(`${ctx}: "example" must be ≥ 8 characters.`);

    if (!r.exampleTr?.trim() || r.exampleTr.trim().length < 5)
      errors.push(`${ctx}: "exampleTr" is required and must be ≥ 5 characters.`);

    if (!VALID_LEVELS.has(r.level))
      errors.push(`${ctx}: invalid level "${r.level}".`);
    if (!VALID_CEFR.has(r.cefrLevel))
      errors.push(`${ctx}: invalid cefrLevel "${r.cefrLevel}".`);

    if (VALID_LEVELS.has(r.level) && VALID_CEFR.has(r.cefrLevel)) {
      const expected = CEFR_TO_LEVEL[r.cefrLevel];
      if (expected && expected !== r.level)
        errors.push(`${ctx}: level/cefrLevel mismatch — ${r.cefrLevel} → "${expected}", got "${r.level}".`);
    }

    if (!VALID_POS.has(r.partOfSpeech))
      errors.push(`${ctx}: invalid partOfSpeech "${r.partOfSpeech}".`);
    if (!VALID_TOPICS.has(r.topic))
      errors.push(`${ctx}: invalid topic "${r.topic}".`);
  }

  return errors;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const hr = '─'.repeat(60);

// ─── Main ─────────────────────────────────────────────────────────────────────

const candidatePath = process.argv[2];

if (!candidatePath) {
  console.error('\n❌ Usage: npm run merge:candidates -- <path-to-candidate-csv>\n');
  console.error('   Example: npm run merge:candidates -- content/candidates/vocab_batch_001.csv\n');
  process.exit(1);
}

const resolvedPath = path.resolve(ROOT, candidatePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`\n❌ File not found: ${resolvedPath}\n`);
  process.exit(1);
}

if (!fs.existsSync(MAIN_CSV)) {
  console.error(`\n❌ Main vocabulary not found: ${MAIN_CSV}\n`);
  process.exit(1);
}

console.log(`\n${hr}`);
console.log('  WordSwipe — Vocabulary Candidate Merge');
console.log(hr);
console.log(`  File: ${candidatePath}`);
console.log(hr);

// ── Step 1: Load and re-validate candidates ───────────────────────────────────

const candidateRows = parseCSV(resolvedPath);

if (candidateRows.length === 0) {
  console.error('\n❌ Candidate file is empty or has no data rows.\n');
  process.exit(1);
}

const mainRows     = parseCSV(MAIN_CSV);
const existingWords = new Set(mainRows.map(r => r.word.toLowerCase().trim()));

console.log(`\n⏳ Re-validating ${candidateRows.length} candidates against ${mainRows.length} existing words...`);

const validationErrors = validateCandidates(candidateRows, existingWords);
if (validationErrors.length > 0) {
  console.error(`\n❌ Validation failed — ${validationErrors.length} error(s):`);
  for (const e of validationErrors) console.error(`   ${e}`);
  console.error(`\n   Fix errors with: npm run validate:candidates -- ${candidatePath}\n`);
  process.exit(1);
}

console.log('✅ Validation passed.\n');

// ── Step 2: Find max existing ID ──────────────────────────────────────────────

const maxExistingId = mainRows.reduce((max, r) => {
  const n = parseInt(r.id, 10);
  return isNaN(n) ? max : Math.max(max, n);
}, 0);

const firstNewId = maxExistingId + 1;
const lastNewId  = maxExistingId + candidateRows.length;

console.log(`📌 Existing max ID: ${maxExistingId}`);
console.log(`📌 Assigning IDs:   ${firstNewId} – ${lastNewId}`);

// ── Step 3: Build rows with assigned IDs ──────────────────────────────────────

const rowsWithIds: (CSVRow & { id: string })[] = candidateRows.map((r, i) => ({
  ...r,
  id: String(firstNewId + i),
}));

// ── Step 4: Append to vocabulary.csv ──────────────────────────────────────────

const appendLines = rowsWithIds.map(rowToCSVLine).join('\n') + '\n';

// Ensure the existing file ends with a newline before appending
const existingContent = fs.readFileSync(MAIN_CSV, 'utf-8');
const needsNewline = existingContent.length > 0 && !existingContent.endsWith('\n');
const prefix = needsNewline ? '\n' : '';

fs.appendFileSync(MAIN_CSV, prefix + appendLines, 'utf-8');
console.log(`\n✅ Appended ${candidateRows.length} rows to content/vocabulary.csv`);

// ── Steps 5–6: Regenerate and validate ────────────────────────────────────────

const recoveryMsg = [
  '',
  '⚠  vocabulary.csv was modified but vocabulary.ts may be out of sync.',
  '   Fix the issue, then run:',
  '     npm run vocab:generate -- --write',
  '     npm run validate:vocab',
  '   Or revert both files:',
  '     git checkout content/vocabulary.csv src/data/vocabulary.ts',
  '',
].join('\n');

console.log('\n⏳ Running vocab:generate...');
try {
  execSync('npm run vocab:generate -- --write', {
    cwd: ROOT,
    stdio: 'inherit',
  });
} catch {
  console.error(recoveryMsg);
  process.exit(1);
}

console.log('\n⏳ Running validate:vocab...');
try {
  execSync('npm run validate:vocab', {
    cwd: ROOT,
    stdio: 'inherit',
  });
} catch {
  console.error(recoveryMsg);
  process.exit(1);
}

// ── Step 7: Success report ────────────────────────────────────────────────────

const levelCounts:  Record<string, number> = {};
const cefrCounts:   Record<string, number> = {};
const posCounts:    Record<string, number> = {};
const topicCounts:  Record<string, number> = {};

for (const r of rowsWithIds) {
  levelCounts[r.level]        = (levelCounts[r.level]        ?? 0) + 1;
  cefrCounts[r.cefrLevel]     = (cefrCounts[r.cefrLevel]     ?? 0) + 1;
  posCounts[r.partOfSpeech]   = (posCounts[r.partOfSpeech]   ?? 0) + 1;
  topicCounts[r.topic]        = (topicCounts[r.topic]        ?? 0) + 1;
}

console.log(`\n${hr}`);
console.log('  ✅ Merge complete!');
console.log(hr);
console.log(`\n  Words added   : ${candidateRows.length}`);
console.log(`  ID range      : ${firstNewId} – ${lastNewId}`);
console.log(`  Total in CSV  : ${mainRows.length + candidateRows.length}`);

console.log('\n  Level:');
for (const [k, v] of Object.entries(levelCounts).sort()) console.log(`    ${k.padEnd(8)}: ${v}`);

console.log('\n  CEFR:');
for (const [k, v] of Object.entries(cefrCounts).sort()) console.log(`    ${k.padEnd(4)}: ${v}`);

console.log('\n  POS:');
for (const [k, v] of Object.entries(posCounts).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(12)}: ${v}`);

console.log('\n  Topic:');
for (const [k, v] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(12)}: ${v}`);

console.log(`\n${hr}`);
console.log('  Next steps:');
console.log('    npx tsc --noEmit');
console.log('    npm run test:srs');
console.log('    npm run test:grammar');
console.log(`    git add content/vocabulary.csv ${candidatePath} src/data/vocabulary.ts`);
console.log(`    git commit -m "vocab: add batch (${firstNewId}–${lastNewId}, ${candidateRows.length} words)"`);
console.log(`${hr}\n`);
