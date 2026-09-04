declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      GRPC_PORT: string;

      GRPC_CA_CERT_PATH: string;
      GRPC_CERT_PATH: string;
      GRPC_PRIVATE_KEY_PATH: string;

      DATABASE_URL: string;

      JWT_TOKEN_SECRET: string;
    }
  }
}

export {};
