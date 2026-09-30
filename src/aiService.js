/**
 * @file aiService.js
 * @description Client integration service for REST AI Gateways and Microservices (USAi, Google AI Studio, ai-lite).
 * Handles endpoint routing, request formatting, envelope validation, and connection testing.
 */

/**
 * Catalog of known enterprise models available on WORK (USAi) and HOME (Gemini).
 */
export const SUPPORTED_WORK_MODELS = [
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'Google', speed: 'Fastest' },
  { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      provider: 'Google', speed: 'Fast' },
  { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro',        provider: 'Google', speed: 'Deep Reasoning' },
  { id: 'gemini-3.7-flash',      name: 'Gemini 3.7 Flash',      provider: 'Google', speed: 'Latest Flash' },
  { id: 'luna',                  name: 'Luna',                  provider: 'USAi',   speed: 'General' },
  { id: 'terra',                 name: 'Terra',                 provider: 'USAi',   speed: 'General' },
  { id: 'claude-3-5-haiku',      name: 'Claude 3.5 Haiku',      provider: 'Anthropic', speed: 'Fast' },
  { id: 'claude-3-5-sonnet',     name: 'Claude 3.5 Sonnet',     provider: 'Anthropic', speed: 'Balanced / Writing' },
  { id: 'claude-3-opus',         name: 'Claude 3 Opus',         provider: 'Anthropic', speed: 'Complex Analysis' }
];

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
 * Parses and unpacks standard LLM responses across OpenAI/USAi, Gemini native, and ai-lite envelopes.
 * @param {object|string} rawPayload Response JSON object or string.
 * @returns {{success: boolean, text?: string, model?: string, elapsedMs?: number, code?: string, message?: string}}
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

  // 1. OpenAI / USAi chat completions format: { choices: [{ message: { content: "..." } }] }
  if (Array.isArray(payload.choices) && payload.choices.length > 0) {
    const choice = payload.choices[0];
    const text = choice?.message?.content || choice?.text || '';
    return {
      success: true,
      text: String(text).trim(),
      model: payload.model || null,
      elapsedMs: typeof payload.elapsedMs === 'number' ? payload.elapsedMs : 0
    };
  }

  // 2. Google Gemini native generateContent format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  if (Array.isArray(payload.candidates) && payload.candidates.length > 0) {
    const candidate = payload.candidates[0];
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts.map(p => p.text || '').join('');
    return {
      success: true,
      text: String(text).trim(),
      model: payload.modelVersion || null,
      elapsedMs: typeof payload.elapsedMs === 'number' ? payload.elapsedMs : 0
    };
  }

  // 3. ai-lite / Sheets microservice format: { response: "...", elapsedMs: 1200 }
  if (payload.response !== undefined) {
    return {
      success: true,
      text: String(payload.response),
      elapsedMs: typeof payload.elapsedMs === 'number' ? payload.elapsedMs : 0
    };
  }

  // 4. Error envelopes
  if (payload.error) {
    if (typeof payload.error === 'object') {
      return {
        success: false,
        code: payload.error.code || payload.error.type || 'AI_ERROR',
        message: payload.error.message || 'An error occurred during AI processing.'
      };
    }
    return {
      success: false,
      code: 'AI_ERROR',
      message: String(payload.error)
    };
  }

  return {
    success: false,
    code: 'UNKNOWN_FORMAT',
    message: 'Response payload contained unrecognized structure.'
  };
}

/**
 * Tests connection to the AI endpoint by querying manifest (for Web App) or validating response.
 * @param {string} serviceUrl Web App endpoint URL.
 * @param {Function} [fetchFn=fetch] HTTP fetch function (supports dependency injection for testing).
 * @returns {Promise<{success: boolean, service?: string, version?: string, elapsedMs?: number, error?: string}>}
 */
export async function testAiConnection(serviceUrl, fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
  if (!serviceUrl || typeof serviceUrl !== 'string') {
    return { success: false, error: 'No service URL provided.' };
  }
  if (!fetchFn) {
    return { success: false, error: 'Fetch client is unavailable in this environment.' };
  }

  const cleanUrl = serviceUrl.trim();
  const isAppsScriptWebApp = cleanUrl.includes('script.google.com');
  const targetUrl = isAppsScriptWebApp && !cleanUrl.endsWith('/v1')
    ? buildAiServiceUrl(cleanUrl, 'v1')
    : cleanUrl;

  const start = Date.now();
  try {
    const res = await fetchFn(targetUrl, {
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

    if (data && (data.choices || data.models || data.status === 'ok' || data.name)) {
      return {
        success: true,
        service: 'openai-compatible',
        version: 'v1',
        elapsedMs
      };
    }

    return {
      success: false,
      error: `Service at ${targetUrl} did not return expected manifest or response.`
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to connect to AI endpoint at ${targetUrl}: ${err.message || err.toString()}`
    };
  }
}

/**
 * Sends a prompt to the AI endpoint (supports USAi / OpenAI chat completions, Gemini, and ai-lite).
 * @param {string} serviceUrl Web App endpoint URL.
 * @param {string} apiKey Shared secret API key.
 * @param {string} prompt Prompt text to evaluate.
 * @param {string|Function} [modelOrFetchFn='gemini-2.5-flash'] Model ID string, or fetchFn if 4 arguments passed.
 * @param {Function} [fetchFn=fetch] HTTP fetch function.
 * @returns {Promise<{success: boolean, text?: string, model?: string, elapsedMs?: number, code?: string, message?: string}>}
 */
export async function sendAiPrompt(serviceUrl, apiKey, prompt, modelOrFetchFn = 'gemini-2.5-flash', fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
  let model = modelOrFetchFn;
  let activeFetch = fetchFn;

  // Backwards compatibility: if 4th argument is a function, treat it as fetchFn
  if (typeof modelOrFetchFn === 'function') {
    activeFetch = modelOrFetchFn;
    model = 'gemini-2.5-flash';
  }
  if (!activeFetch && typeof fetch !== 'undefined') {
    activeFetch = fetch;
  }

  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) {
    return { success: false, code: 'EMPTY_PROMPT', message: 'Prompt cannot be empty.' };
  }
  if (!serviceUrl || typeof serviceUrl !== 'string') {
    return { success: false, code: 'CONFIG_ERROR', message: 'No service URL provided.' };
  }
  if (!activeFetch) {
    return { success: false, code: 'ENV_ERROR', message: 'Fetch client is unavailable.' };
  }

  const cleanUrl = serviceUrl.trim();
  const isAppsScriptWebApp = cleanUrl.includes('script.google.com');
  const targetUrl = isAppsScriptWebApp && !cleanUrl.endsWith('/v1')
    ? buildAiServiceUrl(cleanUrl, 'v1')
    : cleanUrl;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    headers['x-goog-api-key'] = apiKey.trim();
  }

  const requestBody = {
    apiKey: apiKey || '',
    model: typeof model === 'string' && model ? model : 'gemini-2.5-flash',
    prompt: cleanPrompt,
    contents: [
      { role: 'user', parts: [{ text: cleanPrompt }] }
    ],
    messages: [
      { role: 'user', content: cleanPrompt }
    ]
  };

  try {
    const res = await activeFetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
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
      message: `Failed to communicate with AI endpoint: ${err.message || err.toString()}`
    };
  }
}
