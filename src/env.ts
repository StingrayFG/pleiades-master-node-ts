const defaultEnv = {
  PORT: '4400'
} as const;

let PORT = process.env.PORT?.trim();
if (!PORT) {
  PORT = defaultEnv.PORT;
}

const CLIENT_URL = process.env.CLIENT_URL?.trim();
if (!CLIENT_URL) {
  throw new Error('missing CLIENT_URL');
}
const REDIS_URL = process.env.REDIS_URL?.trim();
if (!REDIS_URL) {
  throw new Error('missing REDIS_URL');
}
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('missing DATABASE_URL');
}

const JWT_TOKEN_SECRET = process.env.JWT_TOKEN_SECRET?.trim();
if (!JWT_TOKEN_SECRET) {
  throw new Error('missing JWT_TOKEN_SECRET');
}

export const env = {
  PORT,
  CLIENT_URL,
  REDIS_URL,
  DATABASE_URL,
  JWT_TOKEN_SECRET
} as const;

export default env;
