declare global {
  namespace NodeJS {
    interface ProcessEnv {
      LISTEN_HOST: string;
      LISTEN_PORT: string;
      LISTEN_GRPC_PORT: string;

      PUBLIC_HOST: string;
      PUBLIC_PORT: string;

      DATABASE_URL: string;

      NODE_ID_PATH: string;

      BYTE_STORAGE_ROOT_PATH: string;

      USER_JWT_SECRET: string;
      USER_JWT_TTL: string;
      USER_API_KEY_HASH_SECRET: string;
      USER_REFRESH_TOKEN_HASH_SECRET: string;

      ADMIN_JWT_SECRET: string;

      GRPC_CA_CERT_PATH: string;
      GRPC_CERT_PATH: string;
      GRPC_PRIVATE_KEY_PATH: string;
    }
  }
}

export {};
