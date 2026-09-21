const defaultEnv = {
  LISTEN_HOST: '0.0.0.0',
  LISTEN_PORT: '4400',
  LISTEN_GRPC_PORT: '4410',
  PUBLIC_HOST: 'localhost',
  NODE_ID_PATH: 'data/node-id',
  BYTE_STORAGE_ROOT_PATH: 'data/byte-storage',
  USER_JWT_TTL: '30m'
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

const LISTEN_HOST = getEnvValue('LISTEN_HOST', defaultEnv.LISTEN_HOST);
const LISTEN_PORT = parsePort('LISTEN_PORT', getEnvValue('LISTEN_PORT', defaultEnv.LISTEN_PORT));
const LISTEN_GRPC_PORT = parsePort('LISTEN_GRPC_PORT', getEnvValue('LISTEN_GRPC_PORT', defaultEnv.LISTEN_GRPC_PORT));

const PUBLIC_HOST = getEnvValue('PUBLIC_HOST', defaultEnv.PUBLIC_HOST);
const PUBLIC_PORT = parsePort('PUBLIC_PORT', getEnvValue('PUBLIC_PORT', String(LISTEN_GRPC_PORT)));

const DATABASE_URL = validateUrl('DATABASE_URL', getEnvValue('DATABASE_URL'), ['postgres:', 'postgresql:']);

const NODE_ID_PATH = getEnvValue('NODE_ID_PATH', defaultEnv.NODE_ID_PATH);

const BYTE_STORAGE_ROOT_PATH = getEnvValue('BYTE_STORAGE_ROOT_PATH', defaultEnv.BYTE_STORAGE_ROOT_PATH);

const USER_JWT_SECRET = getEnvValue('USER_JWT_SECRET');
const USER_JWT_TTL = getEnvValue('USER_JWT_TTL', defaultEnv.USER_JWT_TTL);

const USER_API_KEY_HASH_SECRET = getEnvValue('USER_API_KEY_HASH_SECRET');
const USER_REFRESH_TOKEN_HASH_SECRET = getEnvValue('USER_REFRESH_TOKEN_HASH_SECRET');

const ADMIN_JWT_SECRET = getEnvValue('ADMIN_JWT_SECRET');

const GRPC_CA_CERT_PATH = getEnvValue('GRPC_CA_CERT_PATH');
const GRPC_CERT_PATH = getEnvValue('GRPC_CERT_PATH');
const GRPC_PRIVATE_KEY_PATH = getEnvValue('GRPC_PRIVATE_KEY_PATH');

export const env = {
  LISTEN_HOST,
  LISTEN_PORT,
  LISTEN_GRPC_PORT,

  PUBLIC_HOST,
  PUBLIC_PORT,

  DATABASE_URL,

  NODE_ID_PATH,

  BYTE_STORAGE_ROOT_PATH,

  USER_JWT_SECRET,
  USER_JWT_TTL,
  USER_API_KEY_HASH_SECRET,
  USER_REFRESH_TOKEN_HASH_SECRET,

  ADMIN_JWT_SECRET,

  GRPC_CA_CERT_PATH,
  GRPC_CERT_PATH,
  GRPC_PRIVATE_KEY_PATH
} as const;

export default env;
