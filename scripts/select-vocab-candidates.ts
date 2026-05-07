/**
 * scripts/select-vocab-candidates.ts
 *
 * Source-list based candidate selector — first step of the professional
 * vocabulary pipeline.
 *
 * Reads a source word list (.txt or .csv), removes words already present in
 * content/vocabulary.csv, and prints the next N available headwords to stdout.
 * It does NOT generate translations, write CSV rows, or call any API.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *
 *   npm run select:candidates -- content/sources/ngsl_words.txt --count 50
 *   npm run select:candidates -- content/sources/ngsl.csv --count 100
 *
 * ─── Source file formats ──────────────────────────────────────────────────────
 *
 *   .txt  — one word per line, lines starting with # are comments
 *   .csv  — first column is used as the word unless a "word" header exists
 *
 * ─── Pipeline position ────────────────────────────────────────────────────────
 *
 *   content/sources/ngsl_words.txt         ← frequency-ordered source list
 *     ↓  npm run select:candidates -- ... --count 50
 *   stdout: 50 headwords
 *     ↓  AI enrichment (translation, example, exampleTr, level, POS, topic)
 *   content/candidates/vocab_batch_XXX.csv
 *     ↓  npm run validate:candidates -- content/candidates/vocab_batch_XXX.csv
 *     ↓  npm run merge:candidates    -- content/candidates/vocab_batch_XXX.csv
 */

import * as fs   from 'fs';
import * as path from 'path';

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT     = path.join(__dirname, '..');
const MAIN_CSV = path.join(ROOT, 'content', 'vocabulary.csv');

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(): { sourceFile: string; count: number } {
  const args = process.argv.slice(2);

  const sourceFile = args.find(a => !a.startsWith('--'));
  if (!sourceFile) {
    console.error('\n❌ Usage: npm run select:candidates -- <source-file> [--count N]\n');
    console.error('   Examples:');
    console.error('     npm run select:candidates -- content/sources/ngsl_words.txt --count 50');
    console.error('     npm run select:candidates -- content/sources/ngsl.csv --count 100\n');
    process.exit(1);
  }

  const countIdx = args.indexOf('--count');
  let count = 50; // default
  if (countIdx !== -1) {
    const raw = args[countIdx + 1];
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < 1) {
      console.error(`\n❌ --count must be a positive integer. Got: "${raw}"\n`);
      process.exit(1);
    }
    count = parsed;
  }

  return { sourceFile, count };
}

// ─── CSV parser (single column, first-column-wins) ───────────────────────────

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

// ─── Source file readers ──────────────────────────────────────────────────────

function readTxt(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
}

function readCsv(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines   = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const wordColIdx = headers.indexOf('word');

  // If a "word" header exists, use that column; otherwise use column 0.
  const colIdx = wordColIdx !== -1 ? wordColIdx : 0;

  // If the first row is a header row (contains "word" or non-word text), skip it.
  const hasHeader = headers.some(h => isNaN(Number(h)) && h.length > 0 && !/^[a-z'-]+$/.test(h));
  const dataStart = hasHeader ? 1 : 0;

  const words: string[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const raw    = (fields[colIdx] ?? '').trim();
    if (raw) words.push(raw);
  }

  return words;
}

// ─── Existing vocabulary loader ───────────────────────────────────────────────

function loadExistingWords(): Set<string> {
  if (!fs.existsSync(MAIN_CSV)) return new Set();
  const content = fs.readFileSync(MAIN_CSV, 'utf-8');
  const lines   = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return new Set();

  const headers  = parseCSVLine(lines[0]).map(h => h.trim());
  const wordIdx  = headers.indexOf('word');
  if (wordIdx === -1) return new Set();

  const words = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const w      = (fields[wordIdx] ?? '').trim().toLowerCase();
    if (w) words.add(w);
  }
  return words;
}

// ─── Function-word filter ─────────────────────────────────────────────────────
//
// The NGSL is frequency-ordered, so its top entries are function words (articles,
// pronouns, auxiliaries, prepositions) that are not useful as standalone flashcard
// items. This set filters them out before candidate selection.

const STOP_WORDS = new Set<string>([
  // Articles
  'the', 'a', 'an',
  // Personal pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  // Possessive determiners
  'my', 'your', 'his', 'our', 'their', 'its',
  // Reflexive
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
  // Demonstratives
  'this', 'that', 'these', 'those',
  // Prepositions
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'about',
  'into', 'over', 'after', 'before', 'between', 'through', 'during', 'without',
  'under', 'within', 'along', 'across', 'behind', 'beyond', 'upon', 'against',
  // Conjunctions
  'and', 'or', 'but', 'if', 'because', 'although', 'while', 'since', 'unless',
  'when', 'where', 'which', 'who', 'whom', 'whose', 'than', 'whether', 'nor',
  // Auxiliaries and modals
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'do', 'does', 'did',
  'have', 'has', 'had',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  // Common determiners / particles
  'all', 'any', 'some', 'no', 'not', 'so', 'then', 'there', 'here',
  'each', 'every', 'both', 'few', 'many', 'more', 'most', 'other', 'such',
  'same', 'own', 'very', 'just', 'also', 'only', 'even', 'too', 'how',
  'what', 'whatever', 'however', 'wherever', 'whenever', 'whoever',
  // Relative/interrogative words that stand alone awkwardly
  'why', 'well', 'now', 'much',
]);

// High-frequency words that survive the stopword filter but are weak as standalone
// flashcard targets: particles, indefinite pronouns, and phrase-bound nouns.
const BORDERLINE_WORDS = new Set<string>([
  'one', 'out', 'down', 'off', 'something', 'another', 'lot',
  'yes',
]);

function isTeachable(word: string): boolean {
  if (STOP_WORDS.has(word)) return false;
  if (BORDERLINE_WORDS.has(word)) return false;
  // Skip single-letter and two-letter words (e.g. "it", "of", "be", "a")
  // — any genuinely useful 2-letter word is already in STOP_WORDS above
  if (word.length < 3) return false;
  return true;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const hr = '─'.repeat(60);

// ─── Main ─────────────────────────────────────────────────────────────────────

const { sourceFile, count } = parseArgs();

const resolvedSource = path.resolve(ROOT, sourceFile);
if (!fs.existsSync(resolvedSource)) {
  console.error(`\n❌ Source file not found: ${resolvedSource}\n`);
  process.exit(1);
}

const ext = path.extname(resolvedSource).toLowerCase();
if (ext !== '.txt' && ext !== '.csv') {
  console.error(`\n❌ Unsupported file type "${ext}". Use .txt or .csv.\n`);
  process.exit(1);
}

// Load source words
const rawSourceWords = ext === '.csv' ? readCsv(resolvedSource) : readTxt(resolvedSource);

// Normalize: lowercase, trim, remove blanks
const normalizedSource = rawSourceWords.map(w => w.toLowerCase().trim()).filter(w => w.length > 0);

// Deduplicate within source (preserve order, keep first occurrence)
const seenInSource = new Set<string>();
const uniqueSourceWords: string[] = [];
for (const w of normalizedSource) {
  if (!seenInSource.has(w)) {
    seenInSource.add(w);
    uniqueSourceWords.push(w);
  }
}

// Load existing vocabulary
const existingWords = loadExistingWords();

// Filter: remove function words / non-teachable entries
const teachableWords = uniqueSourceWords.filter(isTeachable);
const stopwordSkipped = uniqueSourceWords.length - teachableWords.length;

// Filter: remove words already in vocabulary.csv
const available = teachableWords.filter(w => !existingWords.has(w));

// Select up to count words
const selected = available.slice(0, count);

// ─── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${hr}`);
console.log('  WordSwipe — Vocabulary Candidate Selector');
console.log(hr);
console.log(`  Source : ${sourceFile}`);
console.log(`  Count  : ${count} requested`);
console.log(hr);

console.log(`\n📊 Source stats`);
console.log(`   Total source words       : ${normalizedSource.length}`);
console.log(`   Unique in source         : ${uniqueSourceWords.length}`);
console.log(`   Function words skipped   : ${stopwordSkipped}`);
console.log(`   Teachable content words  : ${teachableWords.length}`);
console.log(`   Already in vocabulary    : ${existingWords.size}`);
console.log(`   Overlapping (skipped)    : ${teachableWords.length - available.length}`);
console.log(`   Remaining available      : ${available.length}`);
console.log(`   Selected                 : ${selected.length}`);

if (selected.length === 0) {
  console.log('\n⚠️  No new candidates available. All source words are already in vocabulary.csv.\n');
  process.exit(0);
}

if (selected.length < count) {
  console.log(`\n⚠️  Only ${selected.length} words available (${count} requested). Source list may be exhausted.`);
}

console.log(`\n${hr}`);
console.log('  Selected words (in source order):');
console.log(hr);
console.log('');
for (const w of selected) {
  console.log(`  ${w}`);
}
console.log('');
console.log(`${hr}`);
console.log('  Next step: enrich these words with AI, then save to:');
console.log('  content/candidates/vocab_batch_XXX.csv');
console.log(`${hr}\n`);
