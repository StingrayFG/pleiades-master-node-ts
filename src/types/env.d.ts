declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;

      CLIENT_URL: string;
      REDIS_URL: string;
      DATABASE_URL: string;

      JWT_TOKEN_SECRET: string;
    }
  }
}

export {};
