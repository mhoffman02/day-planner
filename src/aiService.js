/**
 * @file aiService.js
 * @description Client integration service for the Google Sheets AI() Microservice (ai-lite).
 * Handles endpoint routing, request formatting, envelope validation, and connection testing.
 */

/**
 * Normalizes and formats the microservice endpoint URL to target the correct API version route.
 * @param {string} rawUrl Base Web App URL or endpoint URL.
 * @param {string} [version='v1'] API route version.
 * @returns {string} Fully qualified endpoint URL.
 */
export function buildAiServiceUrl(rawUrl, version = 'v1') {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const clean = rawUrl.trim().replace(/\/+$/, '');
  const ver = (version || 'v1').replace(/^\/+|\/+$/g, '');
  if (clean.endsWith(`/${ver}`)) {
    return clean;
  }
  return `${clean}/${ver}`;
}

/**
 * Parses and unpacks the standard ContentService envelope response from ai-lite.
 * Apps Script always returns HTTP 200; this inspects the JSON payload for 'response' vs 'error'.
 * @param {object|string} rawPayload Response JSON object or string.
 * @returns {{success: boolean, text?: string, elapsedMs?: number, code?: string, message?: string}}
 */
export function parseAiResponse(rawPayload) {
  let payload = rawPayload;
  if (typeof rawPayload === 'string') {
    try {
      payload = JSON.parse(rawPayload);
    } catch (parseErr) {
      return {
        success: false,
        code: 'PARSE_ERROR',
        message: `Failed to parse response JSON: ${parseErr.message}`
      };
    }
  }

  if (!payload || typeof payload !== 'object') {
    return {
      success: false,
      code: 'INVALID_PAYLOAD',
      message: 'Received empty or non-object response from AI service.'
    };
  }

  if (payload.response !== undefined) {
    return {
      success: true,
      text: String(payload.response),
      elapsedMs: typeof payload.elapsedMs === 'number' ? payload.elapsedMs : 0
    };
  }

  if (payload.error && typeof payload.error === 'object') {
    return {
      success: false,
      code: payload.error.code || 'UNKNOWN_ERROR',
      message: payload.error.message || 'An error occurred during AI processing.'
    };
  }

  return {
    success: false,
    code: 'UNKNOWN_FORMAT',
    message: 'Response payload contained neither a "response" nor "error" envelope key.'
  };
}

/**
 * Tests connection to the AI microservice by querying the self-describing GET /v1 manifest.
 * @param {string} serviceUrl Web App endpoint URL.
 * @param {Function} [fetchFn=fetch] HTTP fetch function (supports dependency injection for testing).
 * @returns {Promise<{success: boolean, service?: string, version?: string, elapsedMs?: number, error?: string}>}
 */
export async function testAiConnection(serviceUrl, fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
  const url = buildAiServiceUrl(serviceUrl, 'v1');
  if (!url) {
    return { success: false, error: 'No service URL provided.' };
  }
  if (!fetchFn) {
    return { success: false, error: 'Fetch client is unavailable in this environment.' };
  }

  const start = Date.now();
  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const elapsedMs = Date.now() - start;
    let data;
    if (typeof res.json === 'function') {
      data = await res.json();
    } else if (typeof res.text === 'function') {
      data = JSON.parse(await res.text());
    } else {
      data = res;
    }

    if (data && (data.service === 'ai-lite' || (data.endpoints && data.endpoints['POST /v1']))) {
      return {
        success: true,
        service: data.service || 'ai-lite',
        version: data.version || 'v1',
        elapsedMs
      };
    }

    return {
      success: false,
      error: `Service at ${url} did not return expected ai-lite manifest.`
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to connect to AI microservice at ${url}: ${err.message || err.toString()}`
    };
  }
}

/**
 * Sends a prompt to the AI microservice POST /v1 endpoint.
 * @param {string} serviceUrl Web App endpoint URL.
 * @param {string} apiKey Shared secret API key.
 * @param {string} prompt Prompt text to evaluate.
 * @param {Function} [fetchFn=fetch] HTTP fetch function.
 * @returns {Promise<{success: boolean, text?: string, elapsedMs?: number, code?: string, message?: string}>}
 */
export async function sendAiPrompt(serviceUrl, apiKey, prompt, fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
  const url = buildAiServiceUrl(serviceUrl, 'v1');
  if (!url) {
    return { success: false, code: 'CONFIG_ERROR', message: 'No service URL provided.' };
  }
  if (!prompt || !prompt.trim()) {
    return { success: false, code: 'EMPTY_PROMPT', message: 'Prompt cannot be empty.' };
  }
  if (!fetchFn) {
    return { success: false, code: 'ENV_ERROR', message: 'Fetch client is unavailable.' };
  }

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        apiKey: apiKey || '',
        prompt: prompt.trim()
      })
    });

    let raw;
    if (typeof res.json === 'function') {
      raw = await res.json();
    } else if (typeof res.text === 'function') {
      raw = JSON.parse(await res.text());
    } else {
      raw = res;
    }

    return parseAiResponse(raw);
  } catch (err) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      message: `Failed to communicate with AI microservice: ${err.message || err.toString()}`
    };
  }
}
