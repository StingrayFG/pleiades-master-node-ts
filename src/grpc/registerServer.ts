import type { Server as GrpcServer } from '@grpc/grpc-js';
import { Server, ServerCredentials } from '@grpc/grpc-js';

const startRegisterGrpcServer = async ({ host, port }: { host: string; port: number }): Promise<GrpcServer> => {
  const server = new Server();

  await new Promise<void>((resolveBind, rejectBind) => {
    server.bindAsync(`${host}:${port}`, ServerCredentials.createInsecure(), (err) => {
      if (err) {
        rejectBind(err);
        return;
      }

      resolveBind();
    });
  });

  return server;
};

const stopRegisterGrpcServer = async (server: GrpcServer): Promise<void> =>
  new Promise((resolveShutdown, rejectShutdown) => {
    server.tryShutdown((err) => {
      if (err) {
        rejectShutdown(err);
        return;
      }

      resolveShutdown();
    });
  });

export { startRegisterGrpcServer, stopRegisterGrpcServer };
