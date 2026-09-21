import type { Buffer } from 'node:buffer';
import type { PrismaClient } from '@prisma/client';

import type { TaskServiceContract } from '@/modules/tasks/task.service';

import { UserController } from './user.http-controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserTaskHandler } from './user.task-handler';
import {
  createUserApiKeyTaskDefinition,
  createUserRefreshTokenTaskDefinition,
  createUserTaskDefinition,
  revokeUserApiKeyTaskDefinition,
  revokeUserRefreshTokenTaskDefinition,
  rotateUserRefreshTokenTaskDefinition
} from './user.tasks';

/* contract */

type UserModuleDependencies = {
  prisma: PrismaClient;
  taskService: TaskServiceContract;
  apiKeyHashKey: Buffer;
  refreshTokenHashKey: Buffer;
};

type UserModule = {
  repository: UserRepository;
  service: UserService;
  controller: UserController;
};

/* module */

const createUserModule = ({
  prisma,
  taskService,
  apiKeyHashKey,
  refreshTokenHashKey
}: UserModuleDependencies): UserModule => {
  const repository = new UserRepository(prisma);

  const taskHandler = new UserTaskHandler(repository);

  taskService.registerHandler(createUserTaskDefinition, (task) => taskHandler.createUser(task));
  taskService.registerHandler(createUserApiKeyTaskDefinition, (task) => taskHandler.createApiKey(task));
  taskService.registerHandler(revokeUserApiKeyTaskDefinition, (task) => taskHandler.revokeApiKey(task));
  taskService.registerHandler(createUserRefreshTokenTaskDefinition, (task) => taskHandler.createRefreshToken(task));
  taskService.registerHandler(rotateUserRefreshTokenTaskDefinition, (task) => taskHandler.rotateRefreshToken(task));
  taskService.registerHandler(revokeUserRefreshTokenTaskDefinition, (task) => taskHandler.revokeRefreshToken(task));

  const service = new UserService(repository, apiKeyHashKey, refreshTokenHashKey, taskService);

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
