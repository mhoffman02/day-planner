/**
 * @file aiService.test.js
 * @description Unit tests for ai-microservice client integration: URL building, envelope parsing, and network communication.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiServiceUrl,
  parseAiResponse,
  testAiConnection,
  sendAiPrompt
} from '../src/aiService.js';

describe('AI Microservice Client Unit Tests', () => {
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
    it('should extract response text and elapsedMs on success', () => {
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
      assert.ok(res.error.includes('did not return expected ai-lite manifest'));
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
    it('should format request correctly and parse response', async () => {
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
