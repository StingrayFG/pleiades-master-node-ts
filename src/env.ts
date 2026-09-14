const defaultEnv = {
  PORT: '4400',
  GRPC_PORT: '4410',
  NODE_ID_PATH: 'data/node-id',
  JWT_TOKEN_TTL: '30m'
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

const DATABASE_URL = validateUrl('DATABASE_URL', getEnvValue('DATABASE_URL'), ['postgres:', 'postgresql:']);

const NODE_ID_PATH = getEnvValue('NODE_ID_PATH', defaultEnv.NODE_ID_PATH);

const JWT_TOKEN_SECRET = getEnvValue('JWT_TOKEN_SECRET');
const JWT_TOKEN_TTL = getEnvValue('JWT_TOKEN_TTL', defaultEnv.JWT_TOKEN_TTL);

const ADMIN_TOKEN_SECRET = getEnvValue('ADMIN_TOKEN_SECRET');

const GRPC_CA_CERT_PATH = getEnvValue('GRPC_CA_CERT_PATH');
const GRPC_CERT_PATH = getEnvValue('GRPC_CERT_PATH');
const GRPC_PRIVATE_KEY_PATH = getEnvValue('GRPC_PRIVATE_KEY_PATH');

export const env = {
  PORT,
  GRPC_PORT,

  DATABASE_URL,

  NODE_ID_PATH,

  JWT_TOKEN_SECRET,
  JWT_TOKEN_TTL,

  ADMIN_TOKEN_SECRET,

  GRPC_CA_CERT_PATH,
  GRPC_CERT_PATH,
  GRPC_PRIVATE_KEY_PATH
} as const;

export default env;
