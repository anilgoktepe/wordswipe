/**
 * scripts/validate-vocab-candidates.ts
 *
 * Validates a vocabulary candidate file before merging into the main dataset.
 * Run: npm run validate:candidates -- content/candidates/vocab_batch_001.csv
 *
 * ─── Checks ───────────────────────────────────────────────────────────────────
 *
 *   Errors (block merge):
 *     • id is not "auto"
 *     • duplicate word within candidate file
 *     • word already exists in content/vocabulary.csv
 *     • missing or too-short fields
 *     • unknown level / cefrLevel / partOfSpeech / topic values
 *     • level inconsistent with cefrLevel
 *     • word contains spaces (must be single word)
 *     • slash or parentheses in translation
 *     • missing exampleTr
 *
 *   Warnings (informational — do not block merge):
 *     • example does not contain the target word (inflected forms accepted)
 *
 *   Reports:
 *     • total count + level/CEFR/POS/topic distribution
 */

import * as fs   from 'fs';
import * as path from 'path';

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT        = path.join(__dirname, '..');
const MAIN_CSV    = path.join(ROOT, 'content', 'vocabulary.csv');

// ─── Known enum values ────────────────────────────────────────────────────────

const VALID_LEVELS:  Set<string> = new Set(['easy', 'medium', 'hard']);
const VALID_CEFR:    Set<string> = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const VALID_POS:     Set<string> = new Set(['noun', 'verb', 'adjective', 'adverb']);
const VALID_TOPICS:  Set<string> = new Set([
  'daily', 'academic', 'business', 'nature', 'social',
  'emotions', 'travel', 'health', 'technology', 'education',
]);

// ─── level ↔ cefrLevel consistency map ────────────────────────────────────────

const CEFR_TO_LEVEL: Record<string, string> = {
  A1: 'easy', A2: 'easy',
  B1: 'medium', B2: 'medium',
  C1: 'hard', C2: 'hard',
};

// ─── CSV parser (copied from generate-vocabulary.ts) ─────────────────────────

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
    rows.push(row as CSVRow);
  }

  return rows;
}

// ─── Load existing words from vocabulary.csv ──────────────────────────────────

function loadExistingWords(): Set<string> {
  if (!fs.existsSync(MAIN_CSV)) return new Set();
  const content = fs.readFileSync(MAIN_CSV, 'utf-8');
  const rows = parseCSV(content);
  return new Set(rows.map(r => r.word.toLowerCase().trim()));
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

const hr  = '─'.repeat(60);
const hr2 = '·'.repeat(60);

// ─── Main ─────────────────────────────────────────────────────────────────────

const candidatePath = process.argv[2];

if (!candidatePath) {
  console.error('\n❌ Usage: npm run validate:candidates -- <path-to-candidate-csv>\n');
  console.error('   Example: npm run validate:candidates -- content/candidates/vocab_batch_001.csv\n');
  process.exit(1);
}

const resolvedPath = path.resolve(ROOT, candidatePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`\n❌ File not found: ${resolvedPath}\n`);
  process.exit(1);
}

console.log(`\n${hr}`);
console.log('  WordSwipe — Candidate Vocabulary Validator');
console.log(hr);
console.log(`  File: ${candidatePath}`);
console.log(hr);

const content = fs.readFileSync(resolvedPath, 'utf-8');
const rows = parseCSV(content);

if (rows.length === 0) {
  console.error('\n❌ File is empty or has no data rows.\n');
  process.exit(1);
}

// Load existing words for cross-file duplicate check
const existingWords = loadExistingWords();

const errors:   string[] = [];
const warnings: string[] = [];

const seenInFile = new Map<string, number>(); // key → row number

// Distribution counters
const levelCounts:  Record<string, number> = {};
const cefrCounts:   Record<string, number> = {};
const posCounts:    Record<string, number> = {};
const topicCounts:  Record<string, number> = {};

for (let i = 0; i < rows.length; i++) {
  const r   = rows[i];
  const row = i + 2; // 1-based + header
  const ctx = `Row ${row} ("${r.word || '?'}")`;

  // ── id must be "auto" ──────────────────────────────────────────────────────
  if (r.id !== 'auto') {
    errors.push(`${ctx}: id must be "auto" in candidate files. Got: "${r.id}".`);
  }

  // ── word ───────────────────────────────────────────────────────────────────
  if (!r.word?.trim()) {
    errors.push(`${ctx}: "word" is required.`);
    continue; // can't do further checks without a word
  }
  if (r.word.trim().includes(' ')) {
    errors.push(`${ctx}: word must be a single word (no spaces). Got: "${r.word}".`);
  }

  // Duplicate within candidate file
  const key = r.word.toLowerCase().trim();
  if (seenInFile.has(key)) {
    errors.push(`${ctx}: duplicate word "${r.word}" — already in this candidate file at row ${seenInFile.get(key)}.`);
  } else {
    seenInFile.set(key, row);
  }

  // Duplicate vs. main vocabulary
  if (existingWords.has(key)) {
    errors.push(`${ctx}: "${r.word}" already exists in content/vocabulary.csv.`);
  }

  // ── translation ────────────────────────────────────────────────────────────
  if (!r.translation?.trim()) {
    errors.push(`${ctx}: "translation" is required.`);
  } else {
    if (r.translation.includes('/')) {
      errors.push(`${ctx}: slash in translation — pick one Turkish equivalent. Got: "${r.translation}".`);
    }
    if (r.translation.includes('(')) {
      errors.push(`${ctx}: parentheses in translation — keep it clean. Got: "${r.translation}".`);
    }
  }

  // ── example ────────────────────────────────────────────────────────────────
  if (!r.example?.trim() || r.example.trim().length < 8) {
    errors.push(`${ctx}: "example" must be at least 8 characters.`);
  } else if (r.example.trim().length > 200) {
    errors.push(`${ctx}: "example" must be ≤ 200 characters.`);
  } else {
    // Soft warning: example doesn't contain the target word
    const exLower   = r.example.toLowerCase();
    const wordLower = r.word.toLowerCase().trim();
    const stem      = wordLower.slice(0, Math.max(4, wordLower.length - 3));
    if (!exLower.includes(wordLower) && !exLower.includes(stem)) {
      warnings.push(`${ctx}: example may not contain the target word "${r.word}" — verify it's an inflected form.`);
    }
  }

  // ── exampleTr ──────────────────────────────────────────────────────────────
  if (!r.exampleTr?.trim() || r.exampleTr.trim().length < 5) {
    errors.push(`${ctx}: "exampleTr" is required and must be ≥ 5 characters.`);
  }

  // ── level ──────────────────────────────────────────────────────────────────
  if (!VALID_LEVELS.has(r.level)) {
    errors.push(`${ctx}: "level" must be easy | medium | hard. Got: "${r.level}".`);
  }

  // ── cefrLevel ─────────────────────────────────────────────────────────────
  if (!VALID_CEFR.has(r.cefrLevel)) {
    errors.push(`${ctx}: "cefrLevel" must be A1|A2|B1|B2|C1|C2. Got: "${r.cefrLevel}".`);
  }

  // ── level ↔ cefrLevel consistency ─────────────────────────────────────────
  if (VALID_LEVELS.has(r.level) && VALID_CEFR.has(r.cefrLevel)) {
    const expectedLevel = CEFR_TO_LEVEL[r.cefrLevel];
    if (expectedLevel && expectedLevel !== r.level) {
      errors.push(`${ctx}: level/cefrLevel mismatch — ${r.cefrLevel} should map to "${expectedLevel}", got "${r.level}".`);
    }
  }

  // ── partOfSpeech ──────────────────────────────────────────────────────────
  if (!VALID_POS.has(r.partOfSpeech)) {
    errors.push(`${ctx}: "partOfSpeech" must be noun|verb|adjective|adverb. Got: "${r.partOfSpeech}".`);
  }

  // ── topic ─────────────────────────────────────────────────────────────────
  if (!VALID_TOPICS.has(r.topic)) {
    errors.push(`${ctx}: "topic" must be one of the 10 valid topics. Got: "${r.topic}".`);
  }

  // ── Distribution counters (only for valid rows) ────────────────────────────
  if (VALID_LEVELS.has(r.level))  levelCounts[r.level]  = (levelCounts[r.level]  ?? 0) + 1;
  if (VALID_CEFR.has(r.cefrLevel)) cefrCounts[r.cefrLevel] = (cefrCounts[r.cefrLevel] ?? 0) + 1;
  if (VALID_POS.has(r.partOfSpeech)) posCounts[r.partOfSpeech] = (posCounts[r.partOfSpeech] ?? 0) + 1;
  if (VALID_TOPICS.has(r.topic))  topicCounts[r.topic]  = (topicCounts[r.topic]  ?? 0) + 1;
}

// ─── Report ───────────────────────────────────────────────────────────────────

console.log(`\n📦 Total candidates : ${rows.length}`);
if (Object.keys(levelCounts).length > 0) {
  for (const [lvl, cnt] of Object.entries(levelCounts).sort()) {
    console.log(`   ${lvl.padEnd(8)}: ${cnt}`);
  }
}

if (Object.keys(cefrCounts).length > 0) {
  console.log(`\n${hr2}`);
  console.log('   CEFR breakdown:');
  for (const [cefr, cnt] of Object.entries(cefrCounts).sort()) {
    console.log(`     ${cefr.padEnd(4)}: ${cnt}`);
  }
}

if (Object.keys(posCounts).length > 0) {
  console.log(`\n${hr2}`);
  console.log('   partOfSpeech breakdown:');
  for (const [pos, cnt] of Object.entries(posCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${pos.padEnd(12)}: ${cnt}`);
  }
}

if (Object.keys(topicCounts).length > 0) {
  console.log(`\n${hr2}`);
  console.log('   topic breakdown:');
  for (const [topic, cnt] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${topic.padEnd(12)}: ${cnt}`);
  }
}

// Errors
console.log(`\n${hr}`);
if (errors.length === 0) {
  console.log('✅ No errors found.');
} else {
  console.log(`❌ Errors (${errors.length}) — fix before merging:`);
  for (const e of errors) console.log(`   ${e}`);
}

// Warnings
console.log(`\n${hr}`);
if (warnings.length === 0) {
  console.log('✅ No warnings.');
} else {
  console.log(`⚠️  Warnings (${warnings.length}) — review but not blocking:`);
  for (const w of warnings) console.log(`   ${w}`);
}

// Summary
console.log(`\n${hr}`);
if (errors.length === 0) {
  console.log('🎉 Candidate file is valid. Ready to merge:');
  console.log(`   npm run merge:candidates -- ${candidatePath}`);
} else {
  console.log(`❌ ${errors.length} error(s) found. Fix before running merge:candidates.`);
}
console.log(`${hr}\n`);

if (errors.length > 0) process.exit(1);
