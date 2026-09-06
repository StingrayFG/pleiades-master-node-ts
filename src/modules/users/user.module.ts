import type { Buffer } from 'node:buffer';
import type { PrismaClient } from '@prisma/client';

import { UserController } from './user.http-controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

/* contract */

type UserModuleDependencies = {
  prisma: PrismaClient;
  apiKeyHashKey: Buffer;
  refreshTokenHashKey: Buffer;
};

type UserModule = {
  repository: UserRepository;
  service: UserService;
  controller: UserController;
};

/* module */

const createUserModule = ({ prisma, apiKeyHashKey, refreshTokenHashKey }: UserModuleDependencies): UserModule => {
  const repository = new UserRepository(prisma);

  const service = new UserService(repository, apiKeyHashKey, refreshTokenHashKey);

  const controller = new UserController(service);

  return {
    repository,
    service,
    controller
  };
};

/* exports */

export { createUserModule };
export type { UserModule, UserModuleDependencies };
