declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      GRPC_PORT: string;

      REDIS_URL: string;
      DATABASE_URL: string;

      BLOB_SIZE_LIMIT_BYTES: string;

      JWT_TOKEN_SECRET: string;
    }
  }
}

export {};
