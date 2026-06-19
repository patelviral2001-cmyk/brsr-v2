/**
 * Validates env vars at boot. Throws on missing required keys.
 */
type Env = Record<string, string | undefined>;

const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'AI_ENGINE_URL',
  'JWT_SECRET',
  'OPENAI_API_KEY',
];

export function configValidationSchema(env: Env): Env {
  const missing = required.filter((k) => !env[k] || env[k] === '');
  if (missing.length && env.NODE_ENV !== 'test') {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `See .env.example for the full list.`,
    );
  }
  // Sensible defaults
  env.PORT ??= '4000';
  env.LOG_LEVEL ??= 'info';
  env.NODE_ENV ??= 'development';
  return env;
}
