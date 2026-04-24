/**
 * scripts/export-vocabulary.ts
 *
 * Exports the current src/data/vocabulary.ts array to content/vocabulary.csv.
 *
 * Use this once to seed the CSV from the existing TypeScript source,
 * or any time you want to refresh the CSV to match what's in vocabulary.ts.
 *
 * Usage: npm run vocab:export
 *
 * After export, edit content/vocabulary.csv and run:
 *   npm run vocab:generate -- --write
 * to regenerate vocabulary.ts from the updated CSV.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { vocabulary } from '../src/data/vocabulary';

const CSV_PATH = path.join(__dirname, '../content/vocabulary.csv');

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvField(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  // Quote if the field contains a comma, double-quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: (string | number | undefined)[]): string {
  return fields.map(csvField).join(',');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const header = ['id', 'word', 'translation', 'example', 'level', 'cefrLevel', 'partOfSpeech', 'topic'];
const rows   = vocabulary.map(w =>
  csvRow([w.id, w.word, w.translation, w.example, w.level, w.cefrLevel, w.partOfSpeech, w.topic]),
);

const output = [header.join(','), ...rows].join('\n') + '\n';

fs.writeFileSync(CSV_PATH, output, 'utf-8');

console.log(`\n✅ Exported ${vocabulary.length} words to content/vocabulary.csv\n`);
console.log('   Edit the CSV, then run:');
console.log('   npm run vocab:generate -- --write\n');
