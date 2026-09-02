const defaultEnv = {
  PORT: '4400',
  GRPC_PORT: '4410',
  BLOB_SIZE_LIMIT_BYTES: '10485760'
} as const;

const getEnvValue = (name: string, fallback?: string): string => {
  const value = process.env[name]?.trim() || fallback;

  if (!value) {
    throw new Error(`missing ${name}`);
  }

  return value;
};

const parsePositiveInteger = (name: string, value: string): number => {
  const parsedValue = Number(value);

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`invalid ${name}`);
  }

  return parsedValue;
};

const parsePort = (name: string, value: string): number => {
  const port = parsePositiveInteger(name, value);

  if (port > 65535) {
    throw new Error(`invalid ${name}`);
  }

  return port;
};

const validateUrl = (name: string, value: string, allowedProtocols: readonly string[]): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid ${name}`);
  }

  if (!url.hostname || !allowedProtocols.includes(url.protocol)) {
    throw new Error(`invalid ${name}`);
  }

  return value;
};

const PORT = parsePort('PORT', getEnvValue('PORT', defaultEnv.PORT));
const GRPC_PORT = parsePort('GRPC_PORT', getEnvValue('GRPC_PORT', defaultEnv.GRPC_PORT));

const REDIS_URL = validateUrl('REDIS_URL', getEnvValue('REDIS_URL'), ['redis:', 'rediss:']);
const DATABASE_URL = validateUrl('DATABASE_URL', getEnvValue('DATABASE_URL'), ['postgres:', 'postgresql:']);

const BLOB_SIZE_LIMIT_BYTES = parsePositiveInteger(
  'BLOB_SIZE_LIMIT_BYTES',
  getEnvValue('BLOB_SIZE_LIMIT_BYTES', defaultEnv.BLOB_SIZE_LIMIT_BYTES)
);

const JWT_TOKEN_SECRET = getEnvValue('JWT_TOKEN_SECRET');

export const env = {
  PORT,
  GRPC_PORT,

  REDIS_URL,
  DATABASE_URL,

  BLOB_SIZE_LIMIT_BYTES,

  JWT_TOKEN_SECRET
} as const;

export default env;
