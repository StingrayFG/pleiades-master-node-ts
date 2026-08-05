declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      GRPC_PORT: string;

      CLIENT_URL: string;
      REDIS_URL: string;
      DATABASE_URL: string;
      PLACEMENT_GROUP_COUNT: string;

      JWT_TOKEN_SECRET: string;
    }
  }
}

export {};
