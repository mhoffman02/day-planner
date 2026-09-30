/**
 * @file aiService.test.js
 * @description Unit tests for AI service client integration: URL building, envelope parsing, and network communication.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiServiceUrl,
  parseAiResponse,
  testAiConnection,
  sendAiPrompt,
  SUPPORTED_WORK_MODELS
} from '../src/aiService.js';

describe('AI Gateway & Microservice Client Unit Tests', () => {
  describe('SUPPORTED_WORK_MODELS', () => {
    it('should include key models for WORK including Gemini, Claude, and internal models', () => {
      assert.ok(Array.isArray(SUPPORTED_WORK_MODELS));
      assert.ok(SUPPORTED_WORK_MODELS.length >= 8);
      const ids = SUPPORTED_WORK_MODELS.map(m => m.id);
      assert.ok(ids.includes('gemini-2.5-flash'));
      assert.ok(ids.includes('gemini-2.5-pro'));
      assert.ok(ids.includes('gemini-3.7-flash'));
      assert.ok(ids.includes('luna'));
      assert.ok(ids.includes('terra'));
      assert.ok(ids.includes('claude-3-5-haiku'));
      assert.ok(ids.includes('claude-3-5-sonnet'));
      assert.ok(ids.includes('claude-3-opus'));
    });
  });

  describe('buildAiServiceUrl', () => {
    it('should format URL with /v1 route cleanly', () => {
      assert.equal(
        buildAiServiceUrl('https://script.google.com/macros/s/xyz/exec'),
        'https://script.google.com/macros/s/xyz/exec/v1'
      );
      assert.equal(
        buildAiServiceUrl('https://script.google.com/macros/s/xyz/exec/'),
        'https://script.google.com/macros/s/xyz/exec/v1'
      );
      assert.equal(
        buildAiServiceUrl('https://script.google.com/macros/s/xyz/exec/v1'),
        'https://script.google.com/macros/s/xyz/exec/v1'
      );
    });

    it('should handle falsy or invalid inputs', () => {
      assert.equal(buildAiServiceUrl(''), '');
      assert.equal(buildAiServiceUrl(null), '');
    });
  });

  describe('parseAiResponse', () => {
    it('should extract response text and elapsedMs on success (ai-lite format)', () => {
      const payload = {
        service: 'ai-lite',
        version: 'v1',
        response: 'Plan three focused work blocks for tomorrow morning.',
        elapsedMs: 3450
      };
      const result = parseAiResponse(payload);
      assert.equal(result.success, true);
      assert.equal(result.text, 'Plan three focused work blocks for tomorrow morning.');
      assert.equal(result.elapsedMs, 3450);
    });

    it('should parse USAi / OpenAI chat completions format', () => {
      const payload = {
        id: 'chatcmpl-123',
        model: 'claude-3-5-sonnet',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Executive summary of meeting notes.'
            }
          }
        ],
        elapsedMs: 850
      };
      const result = parseAiResponse(payload);
      assert.equal(result.success, true);
      assert.equal(result.text, 'Executive summary of meeting notes.');
      assert.equal(result.model, 'claude-3-5-sonnet');
      assert.equal(result.elapsedMs, 850);
    });

    it('should parse Google Gemini native generateContent format', () => {
      const payload = {
        modelVersion: 'gemini-2.5-flash',
        candidates: [
          {
            content: {
              parts: [{ text: 'Here are your action items.' }],
              role: 'model'
            }
          }
        ]
      };
      const result = parseAiResponse(payload);
      assert.equal(result.success, true);
      assert.equal(result.text, 'Here are your action items.');
      assert.equal(result.model, 'gemini-2.5-flash');
    });

    it('should parse JSON string input gracefully', () => {
      const jsonStr = JSON.stringify({
        service: 'ai-lite',
        version: 'v1',
        response: 'Review completed task notes.',
        elapsedMs: 1200
      });
      const result = parseAiResponse(jsonStr);
      assert.equal(result.success, true);
      assert.equal(result.text, 'Review completed task notes.');
    });

    it('should extract structured error details when error key is present', () => {
      const errorPayload = {
        service: 'ai-lite',
        version: 'v1',
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid apiKey.'
        }
      };
      const result = parseAiResponse(errorPayload);
      assert.equal(result.success, false);
      assert.equal(result.code, 'UNAUTHORIZED');
      assert.equal(result.message, 'Missing or invalid apiKey.');
    });

    it('should handle service busy error', () => {
      const busyPayload = {
        service: 'ai-lite',
        version: 'v1',
        error: {
          code: 'SERVICE_BUSY',
          message: 'Server is handling another request; lock acquisition timed out.'
        }
      };
      const result = parseAiResponse(busyPayload);
      assert.equal(result.success, false);
      assert.equal(result.code, 'SERVICE_BUSY');
    });

    it('should handle formula error or timeout', () => {
      const timeoutPayload = {
        service: 'ai-lite',
        version: 'v1',
        error: {
          code: 'AI_TIMEOUT',
          message: 'The AI() formula did not complete calculation within limits.'
        }
      };
      const result = parseAiResponse(timeoutPayload);
      assert.equal(result.success, false);
      assert.equal(result.code, 'AI_TIMEOUT');
    });

    it('should handle malformed JSON', () => {
      const result = parseAiResponse('not-a-valid-json{');
      assert.equal(result.success, false);
      assert.equal(result.code, 'PARSE_ERROR');
    });
  });

  describe('testAiConnection', () => {
    it('should return success when service returns valid ai-lite manifest', async () => {
      const mockFetch = async (url) => {
        assert.equal(url, 'https://script.google.com/macros/s/test/exec/v1');
        return {
          ok: true,
          json: async () => ({
            service: 'ai-lite',
            version: 'v1',
            endpoints: { 'POST /v1': {} }
          })
        };
      };

      const res = await testAiConnection('https://script.google.com/macros/s/test/exec', mockFetch);
      assert.equal(res.success, true);
      assert.equal(res.service, 'ai-lite');
      assert.equal(res.version, 'v1');
    });

    it('should report failure when service manifest is invalid', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({ service: 'other-service' })
      });

      const res = await testAiConnection('https://script.google.com/macros/s/test/exec', mockFetch);
      assert.equal(res.success, false);
      assert.ok(res.error.includes('did not return expected manifest'));
    });

    it('should handle network exceptions', async () => {
      const mockFetch = async () => {
        throw new Error('Connection refused');
      };

      const res = await testAiConnection('https://script.google.com/macros/s/test/exec', mockFetch);
      assert.equal(res.success, false);
      assert.ok(res.error.includes('Connection refused'));
    });
  });

  describe('sendAiPrompt', () => {
    it('should format request correctly with legacy 4-arg signature', async () => {
      let capturedBody = null;
      let capturedHeaders = null;

      const mockFetch = async (url, opts) => {
        assert.equal(url, 'https://script.google.com/macros/s/test/exec/v1');
        capturedHeaders = opts.headers;
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            service: 'ai-lite',
            version: 'v1',
            response: 'Synthesized daily action plan.',
            elapsedMs: 2800
          })
        };
      };

      const result = await sendAiPrompt(
        'https://script.google.com/macros/s/test/exec',
        'secret-key-123',
        'Summarize today notes',
        mockFetch
      );

      assert.equal(result.success, true);
      assert.equal(result.text, 'Synthesized daily action plan.');
      assert.equal(capturedBody.apiKey, 'secret-key-123');
      assert.equal(capturedBody.prompt, 'Summarize today notes');
      assert.equal(capturedHeaders['Content-Type'], 'application/json');
      assert.equal(capturedHeaders['Authorization'], 'Bearer secret-key-123');
    });

    it('should format request with explicit model parameter (USAi / OpenAI style)', async () => {
      let capturedBody = null;
      let capturedHeaders = null;

      const mockFetch = async (url, opts) => {
        assert.equal(url, 'https://usai.example.gov/v1/chat/completions');
        capturedHeaders = opts.headers;
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            choices: [
              { message: { content: 'Claude Sonnet response' } }
            ],
            model: 'claude-3-5-sonnet'
          })
        };
      };

      const result = await sendAiPrompt(
        'https://usai.example.gov/v1/chat/completions',
        'usai-token-xyz',
        'Draft project outline',
        'claude-3-5-sonnet',
        mockFetch
      );

      assert.equal(result.success, true);
      assert.equal(result.text, 'Claude Sonnet response');
      assert.equal(result.model, 'claude-3-5-sonnet');
      assert.equal(capturedBody.model, 'claude-3-5-sonnet');
      assert.equal(capturedBody.prompt, 'Draft project outline');
      assert.deepEqual(capturedBody.messages, [{ role: 'user', content: 'Draft project outline' }]);
      assert.equal(capturedHeaders['Authorization'], 'Bearer usai-token-xyz');
    });

    it('should guard against empty prompt without making network request', async () => {
      let called = false;
      const mockFetch = async () => {
        called = true;
      };

      const result = await sendAiPrompt('https://test.com', 'key', '   ', mockFetch);
      assert.equal(result.success, false);
      assert.equal(result.code, 'EMPTY_PROMPT');
      assert.equal(called, false);
    });
  });
});
