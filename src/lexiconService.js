/**
 * @file lexiconService.js
 * @description In-Binder Lexicon Engine for Dictionary, Synonym, and Antonym Lookups.
 * Integrates Free Dictionary API and Datamuse API with zero API keys and fallback support.
 */

/**
 * Cleans an input word by trimming, converting to lowercase, and stripping
 * leading/trailing punctuation or markdown symbols.
 * @param {string} raw Raw word or phrase.
 * @returns {string} Cleaned search word.
 */
export function cleanLookupWord(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '');
}

/**
 * Finds the word and character boundaries surrounding a caret position in a line of text.
 * @param {string} text The line of text.
 * @param {number} caretPos The 0-indexed cursor position.
 * @returns {{word: string, start: number, end: number}|null} Word boundary info or null.
 */
export function getWordAtCaret(text, caretPos) {
  if (!text || typeof text !== 'string' || caretPos < 0) return null;
  const len = text.length;
  if (caretPos > len) caretPos = len;

  const isWordChar = (ch) => /[a-zA-Z0-9'-]/.test(ch);

  // If cursor is right after a word char, allow inspecting left
  let pos = caretPos;
  if (pos > 0 && !isWordChar(text[pos]) && isWordChar(text[pos - 1])) {
    pos = pos - 1;
  }

  if (pos >= len || !isWordChar(text[pos])) return null;

  let start = pos;
  while (start > 0 && isWordChar(text[start - 1])) {
    start--;
  }

  let end = pos;
  while (end < len && isWordChar(text[end])) {
    end++;
  }

  const rawWord = text.slice(start, end);
  const clean = cleanLookupWord(rawWord);
  if (!clean) return null;

  return { word: clean, start, end };
}

/**
 * Parses raw JSON response from Free Dictionary API into a clean structured format.
 * @param {Array<object>} data Raw API response array.
 * @returns {{phonetic: string, audioUrl: string, meanings: Array<object>, synonyms: Array<string>, antonyms: Array<string>}}
 */
export function parseDictionaryResponse(data) {
  const result = {
    phonetic: '',
    audioUrl: '',
    meanings: [],
    synonyms: [],
    antonyms: []
  };

  if (!Array.isArray(data) || data.length === 0) return result;

  const synSet = new Set();
  const antSet = new Set();

  for (const entry of data) {
    if (!result.phonetic && entry.phonetic) {
      result.phonetic = entry.phonetic;
    }

    if (Array.isArray(entry.phonetics)) {
      for (const p of entry.phonetics) {
        if (!result.phonetic && p.text) {
          result.phonetic = p.text;
        }
        if (!result.audioUrl && p.audio && typeof p.audio === 'string' && p.audio.trim()) {
          let audio = p.audio.trim();
          if (audio.startsWith('//')) audio = 'https:' + audio;
          result.audioUrl = audio;
        }
      }
    }

    if (Array.isArray(entry.meanings)) {
      for (const m of entry.meanings) {
        const pos = m.partOfSpeech || 'general';
        const defs = [];
        if (Array.isArray(m.definitions)) {
          for (const d of m.definitions.slice(0, 3)) {
            defs.push({
              definition: d.definition || '',
              example: d.example || ''
            });
            if (Array.isArray(d.synonyms)) {
              d.synonyms.forEach(s => synSet.add(cleanLookupWord(s)));
            }
            if (Array.isArray(d.antonyms)) {
              d.antonyms.forEach(a => antSet.add(cleanLookupWord(a)));
            }
          }
        }

        if (Array.isArray(m.synonyms)) {
          m.synonyms.forEach(s => synSet.add(cleanLookupWord(s)));
        }
        if (Array.isArray(m.antonyms)) {
          m.antonyms.forEach(a => antSet.add(cleanLookupWord(a)));
        }

        if (defs.length > 0) {
          result.meanings.push({
            partOfSpeech: pos,
            definitions: defs
          });
        }
      }
    }
  }

  // Keep top 3 meanings
  result.meanings = result.meanings.slice(0, 3);
  result.synonyms = Array.from(synSet).filter(Boolean);
  result.antonyms = Array.from(antSet).filter(Boolean);

  return result;
}

/**
 * Parses raw JSON word array from Datamuse API.
 * @param {Array<object>} data Datamuse response array.
 * @param {number} [max=12] Maximum words to return.
 * @returns {Array<string>} List of words.
 */
export function parseDatamuseWords(data, max = 12) {
  if (!Array.isArray(data)) return [];
  const words = [];
  const seen = new Set();
  for (const item of data) {
    if (item && item.word) {
      const clean = cleanLookupWord(item.word);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        words.push(clean);
        if (words.length >= max) break;
      }
    }
  }
  return words;
}

/**
 * Fetches lexicon data directly from client-side public APIs.
 * @param {string} word Word to look up.
 * @param {object} [options]
 * @param {Function} [options.fetchFn=fetch] Custom fetch implementation.
 * @param {number} [options.timeoutMs=3500] Request timeout in milliseconds.
 * @returns {Promise<{success: boolean, word: string, phonetic?: string, audioUrl?: string, meanings?: Array<object>, synonyms?: Array<string>, antonyms?: Array<string>, error?: string}>}
 */
export async function fetchLexiconDirect(word, { fetchFn = (typeof fetch !== 'undefined' ? fetch : null), timeoutMs = 3500 } = {}) {
  const cleanWord = cleanLookupWord(word);
  if (!cleanWord) {
    return { success: false, word: '', error: 'No word provided for lookup.' };
  }

  if (typeof fetchFn !== 'function') {
    return { success: false, word: cleanWord, error: 'Network fetch unavailable.' };
  }

  const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`;
  const synUrl = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleanWord)}&max=12`;
  const antUrl = `https://api.datamuse.com/words?rel_ant=${encodeURIComponent(cleanWord)}&max=12`;

  const fetchWithTimeout = async (url) => {
    let controller = null;
    let signal = null;
    const AbortCtrl = (typeof globalThis !== 'undefined' && globalThis.AbortController) ? globalThis.AbortController : null;
    if (AbortCtrl) {
      controller = new AbortCtrl();
      signal = controller.signal;
      setTimeout(() => controller.abort(), timeoutMs);
    }
    const res = await fetchFn(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  };

  const results = await Promise.allSettled([
    fetchWithTimeout(dictUrl),
    fetchWithTimeout(synUrl),
    fetchWithTimeout(antUrl)
  ]);

  const [dictRes, synRes, antRes] = results;

  let parsedDict = { phonetic: '', audioUrl: '', meanings: [], synonyms: [], antonyms: [] };
  let foundAny = false;

  if (dictRes.status === 'fulfilled' && Array.isArray(dictRes.value)) {
    parsedDict = parseDictionaryResponse(dictRes.value);
    foundAny = true;
  }

  const datamuseSyns = (synRes.status === 'fulfilled') ? parseDatamuseWords(synRes.value, 12) : [];
  const datamuseAnts = (antRes.status === 'fulfilled') ? parseDatamuseWords(antRes.value, 12) : [];

  if (datamuseSyns.length > 0 || datamuseAnts.length > 0) {
    foundAny = true;
  }

  if (!foundAny) {
    return {
      success: false,
      word: cleanWord,
      error: `No definitions or thesaurus entries found for "${cleanWord}".`
    };
  }

  // Merge and deduplicate synonyms and antonyms
  const synSet = new Set(parsedDict.synonyms.concat(datamuseSyns));
  synSet.delete(cleanWord);
  const antSet = new Set(parsedDict.antonyms.concat(datamuseAnts));
  antSet.delete(cleanWord);

  return {
    success: true,
    word: cleanWord,
    phonetic: parsedDict.phonetic,
    audioUrl: parsedDict.audioUrl,
    meanings: parsedDict.meanings,
    synonyms: Array.from(synSet).slice(0, 16),
    antonyms: Array.from(antSet).slice(0, 16)
  };
}

/**
 * Orchestrates lexicon lookup: tries direct fetch first, falls back to GAS bridge if available.
 * @param {string} word Word to look up.
 * @param {object} [options]
 * @param {object} [options.gasBridge] Optional GAS bridge instance.
 * @param {Function} [options.fetchFn] Custom fetch function.
 * @returns {Promise<object>} Lexicon result.
 */
export async function fetchLexicon(word, { gasBridge = null, fetchFn = (typeof fetch !== 'undefined' ? fetch : null) } = {}) {
  const cleanWord = cleanLookupWord(word);
  if (!cleanWord) {
    return { success: false, word: '', error: 'Please enter a word to look up.' };
  }

  try {
    const directResult = await fetchLexiconDirect(cleanWord, { fetchFn });
    if (directResult.success) {
      return directResult;
    }
  } catch (err) {
    console.warn('[lexiconService] Direct fetch failed, checking GAS bridge fallback:', err);
  }

  if (gasBridge && typeof gasBridge.fetchLexicon === 'function') {
    try {
      const bridgeResult = await gasBridge.fetchLexicon(cleanWord);
      if (bridgeResult && bridgeResult.success) {
        return bridgeResult;
      }
    } catch (bridgeErr) {
      console.warn('[lexiconService] GAS bridge fallback failed:', bridgeErr);
    }
  }

  return {
    success: false,
    word: cleanWord,
    error: `No definitions found for "${cleanWord}".`
  };
}
