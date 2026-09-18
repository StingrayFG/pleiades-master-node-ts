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

      JWT_TOKEN_SECRET: string;
      JWT_TOKEN_TTL: string;

      ADMIN_TOKEN_SECRET: string;

      GRPC_CA_CERT_PATH: string;
      GRPC_CERT_PATH: string;
      GRPC_PRIVATE_KEY_PATH: string;
    }
  }
}

export {};
