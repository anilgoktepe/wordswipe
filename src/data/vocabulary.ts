/**
 * Granular CEFR proficiency level.
 * Maps to the coarse `level` field as follows:
 *   easy   → A1, A2
 *   medium → B1, B2
 *   hard   → C1, C2
 * Individual words may carry an explicit `cefrLevel` for finer-grained
 * filtering; if omitted, the group is inferred from `level` via CEFR_GROUPS.
 */
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** Grammatical category — optional metadata, never affects lesson engine logic. */
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase' | 'other';

/**
 * Thematic group — optional metadata for future topic-based lesson filtering.
 * Content pipeline: set in vocabulary.csv; validated but not required.
 */
export type WordTopic =
  | 'daily'
  | 'academic'
  | 'business'
  | 'nature'
  | 'social'
  | 'emotions'
  | 'travel'
  | 'health'
  | 'technology'
  | 'education';

export interface Word {
  id: number;
  word: string;
  translation: string;
  example: string;
  /** Coarse difficulty tier — drives SRS scheduling and level selection. */
  level: 'easy' | 'medium' | 'hard';
  /**
   * Optional granular CEFR level within the coarse tier.
   * Omitted on existing words; can be populated per-word as the vocabulary grows.
   */
  cefrLevel?: CEFRLevel;
  /**
   * Word origin: omitted / 'default' for built-in vocabulary, 'custom' for
   * words manually added by the user.  Used for UI discrimination only — the
   * core SRS and quiz engine treat both sources identically.
   */
  source?: 'default' | 'custom';
  /** Unix-ms timestamp set when the word was added (custom words only). */
  addedAt?: number;
  /** Grammatical category — set by content pipeline, used for future filtering. */
  partOfSpeech?: PartOfSpeech;
  /** Thematic group — set by content pipeline, used for future topic-based lessons. */
  topic?: WordTopic;
}

// ─── VOCABULARY DATA START ────────────────────────────────────────────────────
// This block is managed by scripts/generate-vocabulary.ts.
// Edit content/vocabulary.csv, then run: npm run vocab:generate -- --write
// Do not edit this section by hand — your changes will be overwritten.
// ──────────────────────────────────────────────────────────────────────────────
export const vocabulary: Word[] = [
  // ===== EASY WORDS (A1-A2) =====
  { id: 1, word: 'pencil', translation: 'kalem', example: 'I write with a pencil.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 2, word: 'book', translation: 'kitap', example: 'She reads a book every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'education' },
  { id: 3, word: 'water', translation: 'su', example: 'I drink water every morning.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 4, word: 'phone', translation: 'telefon', example: 'My phone is on the table.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 5, word: 'friend', translation: 'arkadaş', example: 'He is my best friend.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 6, word: 'house', translation: 'ev', example: 'We live in a big house.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 7, word: 'car', translation: 'araba', example: 'The car is red.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 8, word: 'dog', translation: 'köpek', example: 'The dog is very cute.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 9, word: 'cat', translation: 'kedi', example: 'The cat sleeps on the sofa.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 10, word: 'apple', translation: 'elma', example: 'I eat an apple every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 11, word: 'door', translation: 'kapı', example: 'Please close the door.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 12, word: 'window', translation: 'pencere', example: 'Open the window please.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 13, word: 'chair', translation: 'sandalye', example: 'Sit on the chair.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 14, word: 'table', translation: 'masa', example: 'The book is on the table.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 15, word: 'school', translation: 'okul', example: 'I go to school every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'education' },
  { id: 16, word: 'teacher', translation: 'öğretmen', example: 'My teacher is very kind.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'education' },
  { id: 17, word: 'student', translation: 'öğrenci', example: 'She is a good student.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'education' },
  { id: 18, word: 'food', translation: 'yemek', example: 'The food is delicious.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 19, word: 'bread', translation: 'ekmek', example: 'We buy fresh bread every morning.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 20, word: 'milk', translation: 'süt', example: 'Children should drink milk.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 21, word: 'tea', translation: 'çay', example: 'I drink tea in the morning.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 22, word: 'coffee', translation: 'kahve', example: 'He drinks coffee every morning.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 23, word: 'sun', translation: 'güneş', example: 'The sun rises in the east.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 24, word: 'moon', translation: 'ay', example: 'The moon is bright tonight.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 25, word: 'tree', translation: 'ağaç', example: 'The tree is very tall.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 26, word: 'flower', translation: 'çiçek', example: 'She grows beautiful flowers.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 27, word: 'road', translation: 'yol', example: 'The road is very long.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 28, word: 'city', translation: 'şehir', example: 'Istanbul is a big city.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 29, word: 'country', translation: 'ülke', example: 'Turkey is a beautiful country.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 30, word: 'family', translation: 'aile', example: 'My family is very important to me.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 31, word: 'mother', translation: 'anne', example: 'My mother cooks very well.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 32, word: 'father', translation: 'baba', example: 'My father works hard.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 33, word: 'baby', translation: 'bebek', example: 'The baby is sleeping.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 34, word: 'boy', translation: 'erkek çocuk', example: 'The boy runs fast.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 35, word: 'girl', translation: 'kız çocuk', example: 'The girl sings beautifully.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 36, word: 'man', translation: 'adam', example: 'The man is tall.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 37, word: 'woman', translation: 'kadın', example: 'The woman is very smart.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 38, word: 'day', translation: 'gün', example: 'Every day is a new beginning.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 39, word: 'night', translation: 'gece', example: 'I sleep at night.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 40, word: 'morning', translation: 'sabah', example: 'Good morning!', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 41, word: 'evening', translation: 'akşam', example: 'We have dinner in the evening.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 42, word: 'color', translation: 'renk', example: 'What is your favorite color?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 43, word: 'red', translation: 'kırmızı', example: 'The rose is red.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 44, word: 'blue', translation: 'mavi', example: 'The sky is blue.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 45, word: 'green', translation: 'yeşil', example: 'The grass is green.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 46, word: 'number', translation: 'sayı', example: 'What is your phone number?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 47, word: 'letter', translation: 'mektup / harf', example: 'She wrote a letter to her friend.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 48, word: 'word', translation: 'kelime', example: 'Learn a new word every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'education' },
  { id: 49, word: 'music', translation: 'müzik', example: 'I love listening to music.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 50, word: 'sport', translation: 'spor', example: 'Do you play any sport?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 51, word: 'game', translation: 'oyun', example: 'We play a game together.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 52, word: 'time', translation: 'zaman', example: 'Time goes by very fast.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 53, word: 'year', translation: 'yıl', example: 'Happy New Year!', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 54, word: 'month', translation: 'ay', example: 'There are twelve months in a year.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 55, word: 'week', translation: 'hafta', example: 'There are seven days in a week.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 56, word: 'money', translation: 'para', example: 'I need more money.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 57, word: 'shop', translation: 'dükkan', example: 'Let us go to the shop.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 58, word: 'market', translation: 'pazar', example: 'We buy vegetables from the market.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 59, word: 'hospital', translation: 'hastane', example: 'The hospital is near here.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 60, word: 'doctor', translation: 'doktor', example: 'The doctor helps sick people.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 61, word: 'work', translation: 'iş', example: 'I work every day.', level: 'easy', cefrLevel: 'A2', partOfSpeech: 'noun', topic: 'business' },
  { id: 62, word: 'eat', translation: 'yemek yemek', example: 'I eat lunch at noon.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 63, word: 'drink', translation: 'içmek', example: 'Drink more water.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 64, word: 'sleep', translation: 'uyumak', example: 'I sleep eight hours a night.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'health' },
  { id: 65, word: 'walk', translation: 'yürümek', example: 'I walk to school every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'health' },
  { id: 66, word: 'run', translation: 'koşmak', example: 'She runs in the park.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'health' },
  { id: 67, word: 'speak', translation: 'konuşmak', example: 'I speak Turkish and English.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'social' },
  { id: 68, word: 'read', translation: 'okumak', example: 'I read books every night.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'education' },
  { id: 69, word: 'write', translation: 'yazmak', example: 'Write your name here.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'education' },
  { id: 70, word: 'listen', translation: 'dinlemek', example: 'Listen to the music.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 71, word: 'watch', translation: 'izlemek', example: 'I watch TV in the evening.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 72, word: 'happy', translation: 'mutlu', example: 'She is very happy today.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 73, word: 'sad', translation: 'üzgün', example: 'He looks sad today.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 74, word: 'good', translation: 'iyi', example: 'That is a good idea.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 75, word: 'bad', translation: 'kötü', example: 'That is a bad habit.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 76, word: 'big', translation: 'büyük', example: 'The elephant is very big.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 77, word: 'small', translation: 'küçük', example: 'My room is small but cozy.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 78, word: 'hot', translation: 'sıcak', example: 'The weather is hot today.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 79, word: 'cold', translation: 'soğuk', example: 'It is cold outside.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 80, word: 'new', translation: 'yeni', example: 'I bought a new phone.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 81, word: 'old', translation: 'eski / yaşlı', example: 'This is an old building.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 82, word: 'fast', translation: 'hızlı', example: 'The car is very fast.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 83, word: 'slow', translation: 'yavaş', example: 'The turtle is slow.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 84, word: 'open', translation: 'açmak', example: 'Open the box.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 85, word: 'close', translation: 'kapatmak / kapalı', example: 'Please close the window.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 86, word: 'start', translation: 'başlamak', example: 'The class starts at nine.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 87, word: 'stop', translation: 'durmak', example: 'Stop the car here.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 88, word: 'help', translation: 'yardım', example: 'Can you help me?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 89, word: 'love', translation: 'sevmek', example: 'I love my family.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'verb', topic: 'emotions' },
  { id: 90, word: 'name', translation: 'isim', example: 'What is your name?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 91, word: 'age', translation: 'yaş', example: 'How old are you?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 92, word: 'place', translation: 'yer', example: 'This is a nice place.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 93, word: 'thing', translation: 'şey', example: 'What is that thing?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 94, word: 'person', translation: 'kişi', example: 'She is a kind person.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 95, word: 'idea', translation: 'fikir', example: 'That is a great idea!', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 96, word: 'question', translation: 'soru', example: 'Do you have a question?', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'education' },
  { id: 97, word: 'answer', translation: 'cevap', example: 'Please give me an answer.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'education' },
  { id: 98, word: 'problem', translation: 'sorun', example: 'We have a big problem.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 99, word: 'gift', translation: 'hediye', example: 'She gave me a gift.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'social' },
  { id: 100, word: 'home', translation: 'ev / yuva', example: 'There is no place like home.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 302, word: 'rain', translation: 'yağmur', example: 'It is raining heavily outside.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 303, word: 'snow', translation: 'kar', example: 'The snow is beautiful in winter.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 304, word: 'wind', translation: 'rüzgar', example: 'The wind is very strong today.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 305, word: 'bus', translation: 'otobüs', example: 'I take the bus to school every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 306, word: 'train', translation: 'tren', example: 'The train arrives at noon.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 307, word: 'plane', translation: 'uçak', example: 'The plane landed safely.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 308, word: 'hotel', translation: 'otel', example: 'We stayed in a nice hotel.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 309, word: 'ticket', translation: 'bilet', example: 'I bought a ticket for the concert.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 310, word: 'nurse', translation: 'hemşire', example: 'The nurse took care of the patient.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 311, word: 'exercise', translation: 'egzersiz', example: 'Exercise keeps your body healthy.', level: 'easy', cefrLevel: 'A2', partOfSpeech: 'noun', topic: 'health' },
  { id: 312, word: 'shirt', translation: 'gömlek', example: 'She is wearing a blue shirt.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 313, word: 'bag', translation: 'çanta', example: 'My bag is very heavy today.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 314, word: 'shoe', translation: 'ayakkabı', example: 'Put on your shoes before going out.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 315, word: 'clean', translation: 'temiz', example: 'Please keep your room clean.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 316, word: 'tired', translation: 'yorgun', example: 'I am very tired after work.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 362, word: 'excited', translation: 'heyecanlı', example: 'She is very excited about the trip.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 363, word: 'angry', translation: 'kızgın', example: 'He is angry because he lost the game.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 364, word: 'worried', translation: 'endişeli', example: 'She looks worried about the exam.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 365, word: 'surprised', translation: 'şaşkın', example: 'I was surprised by the good news.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 366, word: 'computer', translation: 'bilgisayar', example: 'I use a computer every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 367, word: 'internet', translation: 'internet', example: 'The internet connects people around the world.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 368, word: 'message', translation: 'mesaj', example: 'She sent me a message this morning.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 369, word: 'trip', translation: 'gezi', example: 'We planned a trip to the beach.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 370, word: 'station', translation: 'istasyon', example: 'The bus station is very crowded.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 371, word: 'passport', translation: 'pasaport', example: 'Do not forget your passport at home.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 372, word: 'sick', translation: 'hasta', example: 'She stayed home because she was sick.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'adjective', topic: 'health' },
  { id: 373, word: 'medicine', translation: 'ilaç', example: 'Take your medicine every day.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 374, word: 'pain', translation: 'ağrı', example: 'I have pain in my back.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'health' },
  { id: 375, word: 'cloud', translation: 'bulut', example: 'The sky is full of dark clouds.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 376, word: 'river', translation: 'nehir', example: 'The river flows through the city.', level: 'easy', cefrLevel: 'A1', partOfSpeech: 'noun', topic: 'nature' },

  // ===== MEDIUM WORDS (B1-B2) =====
  { id: 101, word: 'decision', translation: 'karar', example: 'She made the right decision.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 102, word: 'improve', translation: 'geliştirmek', example: 'I want to improve my English.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'education' },
  { id: 103, word: 'increase', translation: 'artırmak', example: 'We need to increase our sales.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'business' },
  { id: 104, word: 'support', translation: 'desteklemek', example: 'Friends support each other.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'social' },
  { id: 105, word: 'develop', translation: 'geliştirmek', example: 'We must develop new skills.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'education' },
  { id: 106, word: 'achieve', translation: 'başarmak', example: 'Hard work helps you achieve your goals.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'education' },
  { id: 107, word: 'consider', translation: 'göz önünde bulundurmak', example: 'Consider all your options carefully.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'daily' },
  { id: 108, word: 'suggest', translation: 'önermek', example: 'I suggest you study harder.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 109, word: 'require', translation: 'gerektirmek', example: 'This job requires experience.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'business' },
  { id: 110, word: 'provide', translation: 'sağlamak', example: 'We provide good service.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'business' },
  { id: 111, word: 'manage', translation: 'yönetmek', example: 'She manages the whole team.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'business' },
  { id: 112, word: 'express', translation: 'ifade etmek', example: 'Express your feelings clearly.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'emotions' },
  { id: 113, word: 'involve', translation: 'dahil etmek', example: 'Involve everyone in the plan.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'business' },
  { id: 114, word: 'reduce', translation: 'azaltmak', example: 'We must reduce waste.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'nature' },
  { id: 115, word: 'affect', translation: 'etkilemek', example: 'Stress affects your health.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'health' },
  { id: 116, word: 'expect', translation: 'beklemek', example: 'I expect a quick response.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 117, word: 'accept', translation: 'kabul etmek', example: 'I accept the offer.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 118, word: 'protect', translation: 'korumak', example: 'We must protect nature.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'nature' },
  { id: 119, word: 'connect', translation: 'bağlamak', example: 'Connect the cable to the device.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'technology' },
  { id: 120, word: 'discover', translation: 'keşfetmek', example: 'Scientists discover new things every day.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'education' },
  { id: 121, word: 'prepare', translation: 'hazırlamak', example: 'Prepare for the exam.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'education' },
  { id: 122, word: 'explain', translation: 'açıklamak', example: 'Please explain the rules.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'education' },
  { id: 123, word: 'describe', translation: 'tanımlamak', example: 'Describe what you saw.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'education' },
  { id: 124, word: 'compare', translation: 'karşılaştırmak', example: 'Compare the two prices.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'daily' },
  { id: 125, word: 'include', translation: 'dahil etmek', example: 'Include all the details in your report.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'business' },
  { id: 126, word: 'importance', translation: 'önem', example: 'The importance of health cannot be ignored.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'daily' },
  { id: 127, word: 'opportunity', translation: 'fırsat', example: 'This is a great opportunity.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'daily' },
  { id: 128, word: 'challenge', translation: 'zorluk', example: 'Every challenge makes you stronger.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'daily' },
  { id: 129, word: 'experience', translation: 'deneyim', example: 'Experience is the best teacher.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'education' },
  { id: 130, word: 'knowledge', translation: 'bilgi', example: 'Knowledge is power.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'education' },
  { id: 131, word: 'relationship', translation: 'ilişki', example: 'Communication is key in a relationship.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'social' },
  { id: 132, word: 'community', translation: 'topluluk', example: 'We are a strong community.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'social' },
  { id: 133, word: 'society', translation: 'toplum', example: 'Education benefits society.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'social' },
  { id: 134, word: 'culture', translation: 'kültür', example: 'Every country has its own culture.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'social' },
  { id: 135, word: 'tradition', translation: 'gelenek', example: 'This is an old tradition.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'social' },
  { id: 136, word: 'environment', translation: 'çevre', example: 'We must protect the environment.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'nature' },
  { id: 137, word: 'technology', translation: 'teknoloji', example: 'Technology changes our lives.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 138, word: 'economy', translation: 'ekonomi', example: 'The economy is growing.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'business' },
  { id: 139, word: 'education', translation: 'eğitim', example: 'Education is very important.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'education' },
  { id: 140, word: 'research', translation: 'araştırma', example: 'Research takes a long time.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'academic' },
  { id: 141, word: 'solution', translation: 'çözüm', example: 'We need a quick solution.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 142, word: 'strategy', translation: 'strateji', example: 'A good strategy leads to success.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'business' },
  { id: 143, word: 'process', translation: 'süreç', example: 'The process takes time.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'business' },
  { id: 144, word: 'purpose', translation: 'amaç', example: 'What is the purpose of this meeting?', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'daily' },
  { id: 145, word: 'benefit', translation: 'fayda', example: 'Exercise has many benefits.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'health' },
  { id: 146, word: 'risk', translation: 'risk', example: 'There is a risk in every decision.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'business' },
  { id: 147, word: 'influence', translation: 'etki', example: 'Parents influence their children.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'social' },
  { id: 148, word: 'available', translation: 'mevcut / müsait', example: 'Are you available tomorrow?', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 149, word: 'responsible', translation: 'sorumlu', example: 'Be responsible for your actions.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 150, word: 'confident', translation: 'kendinden emin', example: 'She is very confident.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 151, word: 'creative', translation: 'yaratıcı', example: 'She is a very creative person.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 152, word: 'flexible', translation: 'esnek', example: 'Be flexible in your thinking.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 153, word: 'efficient', translation: 'verimli', example: 'We need to be more efficient.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'business' },
  { id: 154, word: 'successful', translation: 'başarılı', example: 'He is a successful businessman.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'business' },
  { id: 155, word: 'professional', translation: 'profesyonel', example: 'Always act in a professional way.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'business' },
  { id: 156, word: 'communication', translation: 'iletişim', example: 'Good communication is essential.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'social' },
  { id: 157, word: 'information', translation: 'bilgi / enformasyon', example: 'I need more information.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'education' },
  { id: 158, word: 'situation', translation: 'durum', example: 'The situation is difficult.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 159, word: 'condition', translation: 'koşul / durum', example: 'The conditions are perfect.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 160, word: 'attitude', translation: 'tutum / tavır', example: 'Your attitude determines your future.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'daily' },
  { id: 161, word: 'behavior', translation: 'davranış', example: 'Good behavior is important.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'social' },
  { id: 162, word: 'schedule', translation: 'program / takvim', example: 'My schedule is very busy.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'business' },
  { id: 163, word: 'effort', translation: 'çaba / gayret', example: 'Put more effort into your work.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 165, word: 'partner', translation: 'ortak / partner', example: 'She is my business partner.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'business' },
  { id: 166, word: 'project', translation: 'proje', example: 'We are working on a big project.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'business' },
  { id: 167, word: 'demand', translation: 'talep', example: 'The demand for this product is high.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'business' },
  { id: 168, word: 'supply', translation: 'arz / tedarik', example: 'Supply and demand balance the market.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'business' },
  { id: 169, word: 'organize', translation: 'düzenlemek', example: 'Organize your workspace.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'business' },
  { id: 170, word: 'communicate', translation: 'iletişim kurmak', example: 'Communicate your ideas clearly.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'social' },
  { id: 171, word: 'progress', translation: 'ilerleme', example: 'I am making good progress.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'education' },
  { id: 172, word: 'announce', translation: 'duyurmak', example: 'The company announced new plans.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'business' },
  { id: 173, word: 'encourage', translation: 'teşvik etmek', example: 'Teachers encourage students.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'education' },
  { id: 174, word: 'promote', translation: 'tanıtmak / terfi ettirmek', example: 'She was promoted to manager.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'business' },
  { id: 175, word: 'continue', translation: 'devam etmek', example: 'Continue working on the project.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 176, word: 'balance', translation: 'denge', example: 'Work-life balance is important.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 177, word: 'positive', translation: 'olumlu / pozitif', example: 'Stay positive even in hard times.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 178, word: 'negative', translation: 'olumsuz / negatif', example: 'Avoid negative thoughts.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 179, word: 'difference', translation: 'fark', example: 'What is the difference between them?', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 180, word: 'similar', translation: 'benzer', example: 'They look similar to each other.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 181, word: 'important', translation: 'önemli', example: 'Health is the most important thing.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 182, word: 'necessary', translation: 'gerekli', example: 'Is it necessary to go?', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 183, word: 'possible', translation: 'mümkün', example: 'Everything is possible with effort.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 184, word: 'difficult', translation: 'zor', example: 'This problem is very difficult.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 185, word: 'different', translation: 'farklı', example: 'Everyone is different.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 186, word: 'common', translation: 'yaygın / ortak', example: 'This is a very common mistake.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 187, word: 'general', translation: 'genel', example: 'In general people are kind.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 188, word: 'specific', translation: 'spesifik / belirli', example: 'Give me a specific example.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 189, word: 'popular', translation: 'popüler', example: 'This song is very popular.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 190, word: 'natural', translation: 'doğal', example: 'Natural food is healthier.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 191, word: 'physical', translation: 'fiziksel', example: 'Physical exercise is important.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'health' },
  { id: 192, word: 'mental', translation: 'zihinsel', example: 'Mental health is just as important.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'health' },
  { id: 193, word: 'social', translation: 'sosyal', example: 'I have an active social life.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 194, word: 'personal', translation: 'kişisel', example: 'This is my personal opinion.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 195, word: 'global', translation: 'küresel', example: 'Climate change is a global problem.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 196, word: 'local', translation: 'yerel', example: 'Support local businesses.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 197, word: 'modern', translation: 'modern', example: 'This is a modern building.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 198, word: 'original', translation: 'özgün / orijinal', example: 'Always be original.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 199, word: 'curious', translation: 'meraklı', example: 'Children are naturally curious.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 200, word: 'patient', translation: 'sabırlı', example: 'Be patient good things take time.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 301, word: 'adapt', translation: 'uyum sağlamak', example: 'You must adapt to new situations.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'daily' },
  { id: 317, word: 'analyze', translation: 'analiz etmek', example: 'We need to analyze the results carefully.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 318, word: 'theory', translation: 'teori', example: 'This is just a theory for now.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'academic' },
  { id: 319, word: 'evaluate', translation: 'değerlendirmek', example: 'Please evaluate all the options.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'academic' },
  { id: 320, word: 'conclude', translation: 'sonuca varmak', example: 'We can conclude that the plan works.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'academic' },
  { id: 321, word: 'digital', translation: 'dijital', example: 'We live in a digital world.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'technology' },
  { id: 322, word: 'network', translation: 'ağ', example: 'Build a strong professional network.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 323, word: 'device', translation: 'cihaz', example: 'This device is very useful.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 324, word: 'stress', translation: 'stres', example: 'Too much stress is harmful to health.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'health' },
  { id: 325, word: 'symptom', translation: 'belirti', example: 'Fever is a common symptom of illness.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'health' },
  { id: 326, word: 'recover', translation: 'iyileşmek', example: 'It takes time to recover from illness.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'verb', topic: 'health' },
  { id: 327, word: 'grateful', translation: 'minnettar', example: 'I am grateful for your support.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 328, word: 'anxious', translation: 'endişeli', example: 'She felt anxious before the exam.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 329, word: 'deadline', translation: 'son teslim tarihi', example: 'We must meet the project deadline.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'business' },
  { id: 330, word: 'budget', translation: 'bütçe', example: 'We need to stick to the budget.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'business' },
  { id: 331, word: 'negotiate', translation: 'müzakere etmek', example: 'They negotiated a fair deal.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'verb', topic: 'business' },
  { id: 347, word: 'destination', translation: 'varış noktası', example: 'Our final destination is Paris.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 348, word: 'departure', translation: 'kalkış', example: 'The departure is at eight in the morning.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 349, word: 'luggage', translation: 'bagaj', example: 'Please check your luggage before boarding.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 350, word: 'reservation', translation: 'rezervasyon', example: 'I made a hotel reservation for next week.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 351, word: 'accommodation', translation: 'konaklama', example: 'We found comfortable accommodation near the city.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'travel' },
  { id: 352, word: 'customs', translation: 'gümrük', example: 'We waited at customs for almost an hour.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 353, word: 'route', translation: 'güzergah', example: 'We chose the scenic route through the mountains.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 354, word: 'journey', translation: 'yolculuk', example: 'The journey took three hours by train.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 355, word: 'landscape', translation: 'manzara', example: 'The mountain landscape was breathtaking.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 356, word: 'wildlife', translation: 'yaban hayatı', example: 'We must protect local wildlife and their habitats.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 357, word: 'harvest', translation: 'hasat', example: 'The farmers celebrated a successful harvest.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 358, word: 'drought', translation: 'kuraklık', example: 'The severe drought damaged the crops badly.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'nature' },
  { id: 359, word: 'ecosystem', translation: 'ekosistem', example: 'We must preserve the ocean ecosystem.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'nature' },
  { id: 360, word: 'habitat', translation: 'yaşam alanı', example: 'Deforestation destroys the natural habitat of animals.', level: 'medium', cefrLevel: 'B2', partOfSpeech: 'noun', topic: 'nature' },
  { id: 361, word: 'climate', translation: 'iklim', example: 'The climate in this region is very mild.', level: 'medium', cefrLevel: 'B1', partOfSpeech: 'noun', topic: 'nature' },

  // ===== HARD WORDS (C1-C2) =====
  { id: 201, word: 'inevitable', translation: 'kaçınılmaz', example: 'Change is inevitable in life.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 202, word: 'comprehensive', translation: 'kapsamlı', example: 'We need a comprehensive plan.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 203, word: 'ambiguous', translation: 'belirsiz / muğlak', example: 'The instructions are ambiguous.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 204, word: 'meticulous', translation: 'titiz / özenli', example: 'She is meticulous in her work.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 205, word: 'deteriorate', translation: 'kötüleşmek', example: 'His health began to deteriorate.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'health' },
  { id: 206, word: 'eloquent', translation: 'belagatlı / akıcı konuşan', example: 'The president gave an eloquent speech.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 207, word: 'ambivalent', translation: 'kararsız / ikircikli', example: 'I feel ambivalent about the decision.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 208, word: 'pragmatic', translation: 'pragmatik / pratik düşünen', example: 'We need a pragmatic solution.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 209, word: 'cynical', translation: 'alaycı / kötümser', example: 'He has a cynical view of politics.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 210, word: 'alleviate', translation: 'hafifletmek / azaltmak', example: 'This medicine will alleviate the pain.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'health' },
  { id: 211, word: 'exacerbate', translation: 'şiddetlendirmek / kötüleştirmek', example: 'Stress can exacerbate health problems.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'health' },
  { id: 212, word: 'phenomenon', translation: 'fenomen / olgu', example: 'This is a natural phenomenon.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 213, word: 'paradox', translation: 'paradoks / çelişki', example: 'It is a strange paradox.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 214, word: 'fundamental', translation: 'temel / köklü', example: 'This is a fundamental right.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 215, word: 'contemporary', translation: 'çağdaş / günümüz', example: 'He is a contemporary artist.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 216, word: 'elaborate', translation: 'ayrıntılı / karmaşık', example: 'She gave an elaborate explanation.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 217, word: 'scrutinize', translation: 'ince eleyip sık dokumak / incelemek', example: 'We must scrutinize the data carefully.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 218, word: 'indigenous', translation: 'yerli / doğal', example: 'The indigenous people have rich traditions.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 219, word: 'perpetual', translation: 'sürekli / kalıcı', example: 'They are in perpetual conflict.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 220, word: 'resilient', translation: 'dayanıklı / esnek', example: 'Children are very resilient.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 221, word: 'profound', translation: 'derin / köklü', example: 'The experience had a profound impact.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 222, word: 'ambition', translation: 'hırs / heves', example: 'Her ambition drives her success.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'emotions' },
  { id: 223, word: 'coherent', translation: 'tutarlı / mantıklı', example: 'Please give a coherent explanation.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 224, word: 'dilemma', translation: 'çıkmaz / ikilem', example: 'I face a difficult dilemma.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 225, word: 'concise', translation: 'özlü / kısa ve öz', example: 'Keep your report concise.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 226, word: 'ambiguity', translation: 'belirsizlik / muğlaklık', example: 'The ambiguity of the law causes problems.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 227, word: 'implication', translation: 'ima / sonuç', example: 'What are the implications of this decision?', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 228, word: 'hypothesis', translation: 'hipotez / varsayım', example: 'The scientist tested the hypothesis.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 229, word: 'empirical', translation: 'ampirik / deneysel', example: 'We need empirical evidence.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 230, word: 'abstract', translation: 'soyut', example: 'Mathematics can be very abstract.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 231, word: 'rationale', translation: 'gerekçe / mantık', example: 'What is the rationale behind this decision?', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 232, word: 'substantial', translation: 'önemli miktarda / sağlam', example: 'There has been a substantial improvement.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 233, word: 'diminish', translation: 'azalmak / küçülmek', example: 'Do not let fear diminish your courage.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'emotions' },
  { id: 234, word: 'sustain', translation: 'sürdürmek / desteklemek', example: 'We must sustain our efforts.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 235, word: 'acknowledge', translation: 'kabul etmek / teslim etmek', example: 'Please acknowledge receipt of this message.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 236, word: 'attribute', translation: 'bağlamak / nitelik', example: 'His success is attributed to hard work.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 237, word: 'contradict', translation: 'çelişmek / inkâr etmek', example: 'These facts contradict each other.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 238, word: 'illustrate', translation: 'örneklemek / göstermek', example: 'Let me illustrate this with an example.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'education' },
  { id: 239, word: 'implement', translation: 'uygulamak / hayata geçirmek', example: 'We will implement the new policy.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'business' },
  { id: 240, word: 'interpret', translation: 'yorumlamak', example: 'How do you interpret this data?', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 241, word: 'manipulate', translation: 'manipüle etmek / çevirmek', example: 'Do not let others manipulate you.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'social' },
  { id: 242, word: 'constitute', translation: 'oluşturmak / teşkil etmek', example: 'This constitutes a serious problem.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 243, word: 'controversial', translation: 'tartışmalı / ihtilaflı', example: 'The decision was very controversial.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 244, word: 'obsolete', translation: 'modası geçmiş / eskimiş', example: 'This technology is now obsolete.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'technology' },
  { id: 245, word: 'lucid', translation: 'anlaşılır / açık', example: 'Her explanation was very lucid.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 246, word: 'daunting', translation: 'yıldırıcı / cesaret kırıcı', example: 'The task ahead is daunting.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 247, word: 'intricate', translation: 'karmaşık / girift', example: 'The design is very intricate.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 248, word: 'eloquence', translation: 'belagat / güzel söz söyleme sanatı', example: 'She spoke with great eloquence.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'social' },
  { id: 249, word: 'leverage', translation: 'kaldıraç etkisi / avantaj kullanmak', example: 'Use your skills as leverage.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'business' },
  { id: 250, word: 'mitigate', translation: 'hafifletmek / azaltmak', example: 'We must mitigate the risk.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'business' },
  { id: 251, word: 'plausible', translation: 'makul / inandırıcı', example: 'That sounds plausible to me.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 252, word: 'prevail', translation: 'galip gelmek / yaygın olmak', example: 'Good always prevails over evil.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 253, word: 'proximity', translation: 'yakınlık', example: 'The proximity of the hospital is convenient.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'daily' },
  { id: 254, word: 'rigorous', translation: 'titiz / sert', example: 'The research was very rigorous.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 255, word: 'spontaneous', translation: 'kendiliğinden / içten gelen', example: 'Her laughter was spontaneous.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 256, word: 'tenacious', translation: 'azimli / ısrarcı', example: 'A tenacious person never gives up.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 257, word: 'ubiquitous', translation: 'her yerde bulunan / yaygın', example: 'Smartphones are now ubiquitous.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'technology' },
  { id: 258, word: 'verbose', translation: 'gereksiz ayrıntılı / laf kalabalığı yapan', example: 'His writing style is too verbose.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 259, word: 'volatile', translation: 'değişken / uçucu', example: 'The market is very volatile.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'business' },
  { id: 260, word: 'zealous', translation: 'gayretli / şevkli', example: 'She is a zealous supporter of the cause.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 261, word: 'benevolent', translation: 'hayırsever / iyiliksever', example: 'He is a benevolent leader.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 262, word: 'candid', translation: 'açık sözlü / dürüst', example: 'Be candid with your feedback.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 263, word: 'clemency', translation: 'merhamet / müsamaha', example: 'The judge showed clemency.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'noun', topic: 'social' },
  { id: 264, word: 'deference', translation: 'saygı / itaat', example: 'Show deference to your elders.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'noun', topic: 'social' },
  { id: 265, word: 'eminent', translation: 'seçkin / tanınmış', example: 'She is an eminent scientist.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 266, word: 'fathom', translation: 'anlamak / kavramak', example: 'I cannot fathom his reasoning.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 267, word: 'gregarious', translation: 'sosyal / topluluğu seven', example: 'She is a gregarious person.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'social' },
  { id: 268, word: 'hasten', translation: 'acele etmek / hızlandırmak', example: 'We must hasten the process.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'daily' },
  { id: 269, word: 'impeccable', translation: 'kusursuz / mükemmel', example: 'Her taste in fashion is impeccable.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 270, word: 'judicious', translation: 'basiretli / sağduyulu', example: 'Make judicious use of your resources.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 271, word: 'laudable', translation: 'övgüye değer / takdire şayan', example: 'Your effort is truly laudable.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 272, word: 'lucrative', translation: 'kazançlı / kârlı', example: 'It is a very lucrative business.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'business' },
  { id: 273, word: 'magnanimous', translation: 'gönülsü geniş / cömert ruhlu', example: 'He was magnanimous in victory.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'social' },
  { id: 274, word: 'nonchalant', translation: 'umursamaz / kayıtsız', example: 'She seemed nonchalant about the result.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 275, word: 'ostentatious', translation: 'gösteriş meraklısı / göz alıcı', example: 'His lifestyle is very ostentatious.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'social' },
  { id: 276, word: 'pervasive', translation: 'her yere yayılan / yaygın', example: 'Fear was pervasive in the community.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'social' },
  { id: 277, word: 'quintessential', translation: 'en tipik / özünü yansıtan', example: 'This is the quintessential example.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 278, word: 'rhetoric', translation: 'retorik / söylem', example: 'His speech was full of rhetoric.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 279, word: 'sagacious', translation: 'bilge / zeki', example: 'A sagacious leader makes wise choices.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 280, word: 'taciturn', translation: 'suskun / az konuşan', example: 'He is a very taciturn man.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'social' },
  { id: 281, word: 'unequivocal', translation: 'kesin / açık seçik', example: 'Give an unequivocal answer.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 282, word: 'venerate', translation: 'saygı göstermek / ibadet etmek', example: 'They venerate their ancestors.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'verb', topic: 'social' },
  { id: 283, word: 'wary', translation: 'ihtiyatlı / dikkatli', example: 'Be wary of strangers.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 284, word: 'xenophobia', translation: 'yabancı düşmanlığı', example: 'Xenophobia is a serious social problem.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'social' },
  { id: 285, word: 'yearning', translation: 'özlem / arzu', example: 'She felt a yearning for home.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'emotions' },
  { id: 286, word: 'zeal', translation: 'gayret / şevk', example: 'He works with great zeal.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'emotions' },
  { id: 287, word: 'auspicious', translation: 'uğurlu / şanslı', example: 'This is an auspicious beginning.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 288, word: 'brevity', translation: 'kısalık / özlülük', example: 'Brevity is the soul of wit.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 289, word: 'corroborate', translation: 'doğrulamak / pekiştirmek', example: 'Can you corroborate this claim?', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 290, word: 'decorum', translation: 'terbiye / uygun davranış', example: 'Please maintain decorum in meetings.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'noun', topic: 'social' },
  { id: 291, word: 'effervescent', translation: 'neşeli / canlı', example: 'She has an effervescent personality.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 292, word: 'fortuitous', translation: 'tesadüfi / şans eseri olan', example: 'Their meeting was fortuitous.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'daily' },
  { id: 293, word: 'grandiose', translation: 'görkemli / abartılı', example: 'He had grandiose plans.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'emotions' },
  { id: 294, word: 'hubris', translation: 'kibir / aşırı gurur', example: 'His hubris led to his downfall.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'noun', topic: 'social' },
  { id: 295, word: 'immutable', translation: 'değişmez / sabit', example: 'Some laws of physics are immutable.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 296, word: 'juxtapose', translation: 'yan yana koymak / karşılaştırmak', example: 'The artist juxtaposes light and shadow.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'verb', topic: 'academic' },
  { id: 297, word: 'laconic', translation: 'kısa ve öz / az sözlü', example: 'His response was laconic but meaningful.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'academic' },
  { id: 298, word: 'mendacious', translation: 'yalancı / yanıltıcı', example: 'Beware of mendacious claims.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'adjective', topic: 'social' },
  { id: 299, word: 'nuance', translation: 'nüans /ince ayrım', example: 'There are many nuances in language.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 300, word: 'obfuscate', translation: 'karmaşıklaştırmak / anlaşılmaz kılmak', example: 'Do not obfuscate the truth.', level: 'hard', cefrLevel: 'C2', partOfSpeech: 'verb', topic: 'academic' },
  { id: 332, word: 'algorithm', translation: 'algoritma', example: 'The algorithm processes the data efficiently.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 333, word: 'disrupt', translation: 'sekteye uğratmak', example: 'New technology can disrupt entire industries.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'technology' },
  { id: 334, word: 'prototype', translation: 'prototip', example: 'They built a prototype before the final product.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'technology' },
  { id: 335, word: 'encrypt', translation: 'şifrelemek', example: 'Always encrypt your sensitive personal data.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'technology' },
  { id: 336, word: 'itinerary', translation: 'seyahat planı', example: 'She prepared a detailed itinerary for the trip.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'travel' },
  { id: 337, word: 'navigate', translation: 'yol bulmak / gezinmek', example: 'It is difficult to navigate in an unfamiliar city.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'travel' },
  { id: 338, word: 'embark', translation: 'yola çıkmak / başlamak', example: 'We are about to embark on a new adventure.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'travel' },
  { id: 339, word: 'entrepreneur', translation: 'girişimci', example: 'She is a successful entrepreneur in the tech industry.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'business' },
  { id: 340, word: 'revenue', translation: 'gelir / hasılat', example: 'The company\'s annual revenue has doubled.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'business' },
  { id: 341, word: 'feasible', translation: 'uygulanabilir', example: 'Is this plan feasible within our budget?', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'business' },
  { id: 342, word: 'benchmark', translation: 'kıyaslama noktası', example: 'Set a benchmark to measure your progress.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'business' },
  { id: 343, word: 'collaborate', translation: 'iş birliği yapmak', example: 'We collaborated on the research project.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'business' },
  { id: 344, word: 'discrepancy', translation: 'tutarsızlık / uyuşmazlık', example: 'There is a discrepancy in the financial data.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 345, word: 'validate', translation: 'doğrulamak', example: 'We need to validate these findings before publishing.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'academic' },
  { id: 346, word: 'perception', translation: 'algı', example: 'Public perception of the issue has changed significantly.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'academic' },
  { id: 377, word: 'erosion', translation: 'erozyon', example: 'Soil erosion is caused by heavy rainfall.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 378, word: 'fertile', translation: 'verimli', example: 'The fertile soil produces excellent crops.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 379, word: 'barren', translation: 'çorak', example: 'The land was barren after years of drought.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 380, word: 'temperate', translation: 'ılıman', example: 'The region has a temperate climate all year.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 381, word: 'cascade', translation: 'çağlayan', example: 'Water cascaded down the rocky hillside.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'nature' },
  { id: 382, word: 'serene', translation: 'huzurlu', example: 'The lake looked serene in the early morning.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'nature' },
  { id: 383, word: 'integrity', translation: 'dürüstlük', example: 'She is known for her integrity.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'social' },
  { id: 384, word: 'empathy', translation: 'empati', example: 'Empathy is essential in any leadership role.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'social' },
  { id: 385, word: 'solidarity', translation: 'dayanışma', example: 'The workers showed great solidarity.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'social' },
  { id: 386, word: 'reconcile', translation: 'uzlaşmak', example: 'They tried to reconcile their differences.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'verb', topic: 'social' },
  { id: 387, word: 'chronic', translation: 'kronik', example: 'He suffers from a chronic back condition.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'health' },
  { id: 388, word: 'diagnosis', translation: 'teşhis', example: 'The diagnosis was confirmed by the specialist.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'health' },
  { id: 389, word: 'immune', translation: 'bağışık', example: 'The body\'s immune system fights off infection.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'adjective', topic: 'health' },
  { id: 390, word: 'melancholy', translation: 'melankoli', example: 'There was a deep sense of melancholy in his voice.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'emotions' },
  { id: 391, word: 'composure', translation: 'soğukkanlılık', example: 'She maintained her composure under pressure.', level: 'hard', cefrLevel: 'C1', partOfSpeech: 'noun', topic: 'emotions' },
];
// ─── VOCABULARY DATA END ──────────────────────────────────────────────────────

export const getWordsByLevel = (level: 'easy' | 'medium' | 'hard'): Word[] =>
  vocabulary.filter(w => w.level === level);

export const getRandomWords = (words: Word[], count: number, exclude?: Word[]): Word[] => {
  const available = exclude
    ? words.filter(w => !exclude.find(e => e.id === w.id))
    : words;
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// ─── CEFR helpers (forward-compatible, no impact on existing code) ────────────

/**
 * Maps each coarse difficulty tier to its CEFR group.
 * Used to derive a CEFR level when a word has no explicit `cefrLevel`.
 */
export const CEFR_GROUPS: Record<Word['level'], CEFRLevel[]> = {
  easy:   ['A1', 'A2'],
  medium: ['B1', 'B2'],
  hard:   ['C1', 'C2'],
};

/**
 * Returns all vocabulary words that belong to the given CEFR level.
 * Words with an explicit `cefrLevel` are matched directly.
 * Words without one fall back to the `CEFR_GROUPS` mapping.
 */
export const getWordsByCEFR = (cefr: CEFRLevel): Word[] =>
  vocabulary.filter(w =>
    w.cefrLevel
      ? w.cefrLevel === cefr
      : CEFR_GROUPS[w.level].includes(cefr),
  );

/** Total number of words in the vocabulary — use this instead of any hardcoded number. */
export const VOCABULARY_COUNT = vocabulary.length;
