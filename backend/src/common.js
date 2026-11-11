export class ApiError extends Error {
  constructor(status, code, message, field, retryable = false) {
    super(message); Object.assign(this, {status, code, field, retryable});
  }
}
export const fail = (status, code, message, field, retryable) => { throw new ApiError(status, code, message, field, retryable); };
export function text(value, field, max = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(400, 'INVALID_INPUT', `${field}: 공백이 아닌 문자열, 최대 ${max}자가 필요합니다.`, field);
  return value.trim();
}
export function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_INPUT', 'JSON 객체가 필요합니다.');
  if (Object.keys(body).some(k => !allowed.includes(k))) fail(400, 'INVALID_INPUT', '허용되지 않은 입력 항목입니다.');
}
export function id(value, field) {
  const v = text(value, field, 100);
  if (!/^[A-Za-z0-9_-]+$/.test(v)) fail(400, 'INVALID_ID', '식별자 형식이 잘못되었습니다.', field);
  return v;
}
export function config(env = process.env) {
  const num = (key, fallback, min, max) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid setting: ${key}`);
    return n;
  };
  const mode = env.APP_MODE || 'demo';
  if (!['demo', 'live'].includes(mode)) throw new Error('APP_MODE must be demo or live');
  if(env.REFERENCE_MODE && !['demo','live'].includes(env.REFERENCE_MODE))throw new Error('REFERENCE_MODE must be demo or live');
  const aiProvider = env.AI_PROVIDER || 'external';
  if (!['external','ollama','groq'].includes(aiProvider)) throw new Error('AI_PROVIDER must be external, groq or ollama');
  return {
    referenceMode: env.REFERENCE_MODE,
    trustProxy: env.TRUST_PROXY==='true',
    referenceDataPath: env.REFERENCE_DATA_PATH,
    python: env.PYTHON_BIN || (process.platform==='win32'?'python':'python3'),
    uploadLimit: num('MAX_UPLOAD_BYTES',5242880,1024,5242880),
    mode, host: env.HOST || '127.0.0.1', port: num('PORT', 3001, 0, 65535),
    dbPath: env.DB_PATH || './var/signall.sqlite',
    origins: (env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()).filter(Boolean),
    ttl: num('SESSION_TTL_SECONDS', 1800, 1, 86400) * 1000,
    maxSessions: num('MAX_SESSIONS', 500, 1, 10000),
    bodyLimit: num('MAX_BODY_BYTES', 65536, 1024, 1048576),
    rateLimit: num('RATE_LIMIT_PER_MINUTE', 30, 1, 10000),
    concurrency: num('MAX_AI_CONCURRENT', 2, 1, 20),
    aiBudget: num('MAX_AI_CALLS_PER_HOUR', 100, 1, 100000),
    aiTimeout: num('AI_TIMEOUT_MS', 20000, 100, 120000),
    aiProvider, aiUrl: env.AI_API_URL || (aiProvider==='groq'?'https://api.groq.com/openai/v1/chat/completions':undefined), aiKey: env.AI_API_KEY,
    aiModel: env.AI_MODEL || (aiProvider==='groq'?'openai/gpt-oss-20b':undefined)
  };
}
