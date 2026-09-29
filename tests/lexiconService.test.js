/**
 * @file lexiconService.test.js
 * @description Unit tests for in-binder lexicon and thesaurus engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanLookupWord,
  getWordAtCaret,
  parseDictionaryResponse,
  parseDatamuseWords,
  fetchLexiconDirect,
  fetchLexicon
} from '../src/lexiconService.js';

describe('Lexicon Service Unit Tests', () => {
  describe('cleanLookupWord', () => {
    it('should strip punctuation, markdown tags, and leading/trailing whitespace', () => {
      assert.equal(cleanLookupWord('  pragmatic...  '), 'pragmatic');
      assert.equal(cleanLookupWord('"innovative"'), 'innovative');
      assert.equal(cleanLookupWord('#Topic,'), 'topic');
      assert.equal(cleanLookupWord('(efficient)'), 'efficient');
      assert.equal(cleanLookupWord('**bold**'), 'bold');
    });

    it('should return empty string for null, undefined, or empty inputs', () => {
      assert.equal(cleanLookupWord(''), '');
      assert.equal(cleanLookupWord(null), '');
      assert.equal(cleanLookupWord(undefined), '');
      assert.equal(cleanLookupWord('   ...   '), '');
    });
  });

  describe('getWordAtCaret', () => {
    it('should extract word at caret in the middle of a line', () => {
      const line = 'We need a pragmatic approach to this.';
      // Index of 'p' in 'pragmatic' is 10, end is 19
      const result = getWordAtCaret(line, 14);
      assert.ok(result);
      assert.equal(result.word, 'pragmatic');
      assert.equal(result.start, 10);
      assert.equal(result.end, 19);
    });

    it('should extract word when caret is at the start or end of the word', () => {
      const line = 'Action items today';
      const atStart = getWordAtCaret(line, 0);
      assert.equal(atStart?.word, 'action');

      const atEnd = getWordAtCaret(line, 6);
      assert.equal(atEnd?.word, 'action');
    });

    it('should return null when caret is on whitespace or empty line', () => {
      const line = 'Word1   Word2';
      const inSpace = getWordAtCaret(line, 6);
      assert.equal(inSpace, null);
      assert.equal(getWordAtCaret('', 0), null);
    });
  });

  describe('parseDictionaryResponse', () => {
    it('should extract phonetics, audio, definitions, and synonyms/antonyms from raw API payload', () => {
      const mockRaw = [
        {
          word: 'pragmatic',
          phonetic: '/præɡˈmætɪk/',
          phonetics: [
            { text: '/præɡˈmætɪk/', audio: '//ssl.gstatic.com/dictionary/static/sounds/20200429/pragmatic--_us_1.mp3' }
          ],
          meanings: [
            {
              partOfSpeech: 'adjective',
              definitions: [
                {
                  definition: 'Dealing with things sensibly and realistically.',
                  example: 'a pragmatic approach to politics.',
                  synonyms: ['practical', 'sensible'],
                  antonyms: ['idealistic']
                }
              ]
            }
          ]
        }
      ];

      const parsed = parseDictionaryResponse(mockRaw);
      assert.equal(parsed.phonetic, '/præɡˈmætɪk/');
      assert.equal(parsed.audioUrl, 'https://ssl.gstatic.com/dictionary/static/sounds/20200429/pragmatic--_us_1.mp3');
      assert.equal(parsed.meanings.length, 1);
      assert.equal(parsed.meanings[0].partOfSpeech, 'adjective');
      assert.equal(parsed.meanings[0].definitions[0].definition, 'Dealing with things sensibly and realistically.');
      assert.deepEqual(parsed.synonyms, ['practical', 'sensible']);
      assert.deepEqual(parsed.antonyms, ['idealistic']);
    });

    it('should handle malformed or empty payloads gracefully', () => {
      const parsed = parseDictionaryResponse([]);
      assert.deepEqual(parsed, {
        phonetic: '',
        audioUrl: '',
        meanings: [],
        synonyms: [],
        antonyms: []
      });
    });
  });

  describe('parseDatamuseWords', () => {
    it('should clean and deduplicate words up to max limit', () => {
      const raw = [
        { word: 'practical', score: 100 },
        { word: 'sensible', score: 90 },
        { word: 'practical', score: 80 },
        { word: 'realistic', score: 70 }
      ];
      const result = parseDatamuseWords(raw, 2);
      assert.deepEqual(result, ['practical', 'sensible']);
    });
  });

  describe('fetchLexiconDirect & fetchLexicon', () => {
    it('should combine dictionary and datamuse results on success', async () => {
      const mockFetch = async (url) => {
        if (url.includes('dictionaryapi.dev')) {
          return {
            ok: true,
            json: async () => [
              {
                word: 'pragmatic',
                phonetic: '/præɡˈmætɪk/',
                meanings: [
                  {
                    partOfSpeech: 'adjective',
                    definitions: [{ definition: 'Sensible and realistic.', example: 'test example' }]
                  }
                ]
              }
            ]
          };
        }
        if (url.includes('rel_syn')) {
          return {
            ok: true,
            json: async () => [{ word: 'practical' }, { word: 'realistic' }]
          };
        }
        if (url.includes('rel_ant')) {
          return {
            ok: true,
            json: async () => [{ word: 'idealistic' }]
          };
        }
        return { ok: false, status: 404 };
      };

      const res = await fetchLexiconDirect('pragmatic', { fetchFn: mockFetch });
      assert.equal(res.success, true);
      assert.equal(res.word, 'pragmatic');
      assert.equal(res.phonetic, '/præɡˈmætɪk/');
      assert.ok(res.synonyms.includes('practical'));
      assert.ok(res.synonyms.includes('realistic'));
      assert.ok(res.antonyms.includes('idealistic'));
    });

    it('should fall back to GAS bridge when direct fetch fails', async () => {
      const mockFetchFailing = async () => {
        throw new Error('CORS / network proxy block');
      };

      const mockBridge = {
        fetchLexicon: async (word) => ({
          success: true,
          word,
          meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'Bridge fallback def' }] }],
          synonyms: ['fallback-syn'],
          antonyms: []
        })
      };

      const res = await fetchLexicon('resilience', {
        fetchFn: mockFetchFailing,
        gasBridge: mockBridge
      });

      assert.equal(res.success, true);
      assert.equal(res.word, 'resilience');
      assert.equal(res.meanings[0].definitions[0].definition, 'Bridge fallback def');
      assert.deepEqual(res.synonyms, ['fallback-syn']);
    });
  });
});
