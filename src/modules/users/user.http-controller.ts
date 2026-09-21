import type { FastifyReply, FastifyRequest } from 'fastify';

import type {
  AuthenticatePasswordInput,
  CreateUserApiKeyInput,
  CreateUserInput,
  RevokeUserApiKeyInput
} from './user.application';
import type {
  CreateApiKeyHttpRoute,
  ListApiKeysHttpRoute,
  LoginHttpRoute,
  LogoutHttpRoute,
  RefreshAuthenticationHttpRoute,
  RevokeApiKeyHttpRoute,
  SignupHttpRoute
} from './user.http-contracts';
import {
  mapCreateApiKeyResultToHttpCreateApiKeyResponse,
  mapDomainUserApiKeyToHttpUserApiKeyResponse,
  mapDomainUserApiKeysToHttpListApiKeysResponse,
  mapDomainUserToHttpUserResponse
} from './user.mappers';
import type { UserServiceContract } from './user.service';

/* contract */

type UserHttpControllerContract = {
  signup(req: FastifyRequest<SignupHttpRoute>, reply: FastifyReply<SignupHttpRoute>): Promise<void>;
  login(req: FastifyRequest<LoginHttpRoute>, reply: FastifyReply<LoginHttpRoute>): Promise<void>;
  refreshAuthentication(
    req: FastifyRequest<RefreshAuthenticationHttpRoute>,
    reply: FastifyReply<RefreshAuthenticationHttpRoute>
  ): Promise<void>;
  logout(req: FastifyRequest<LogoutHttpRoute>, reply: FastifyReply<LogoutHttpRoute>): Promise<void>;
  listApiKeys(req: FastifyRequest<ListApiKeysHttpRoute>, reply: FastifyReply<ListApiKeysHttpRoute>): Promise<void>;
  createApiKey(req: FastifyRequest<CreateApiKeyHttpRoute>, reply: FastifyReply<CreateApiKeyHttpRoute>): Promise<void>;
  revokeApiKey(req: FastifyRequest<RevokeApiKeyHttpRoute>, reply: FastifyReply<RevokeApiKeyHttpRoute>): Promise<void>;
};

/* controller */

class UserController implements UserHttpControllerContract {
  constructor(private readonly service: UserServiceContract) {}

  async signup(req: FastifyRequest<SignupHttpRoute>, reply: FastifyReply<SignupHttpRoute>): Promise<void> {
    const serviceInput: CreateUserInput = {
      username: req.body.username,
      password: req.body.password
    };

    const createdUser = await this.service.createUser(serviceInput);

    const res = mapDomainUserToHttpUserResponse(createdUser);

    await reply.code(201).send(res);
  }

  async login(req: FastifyRequest<LoginHttpRoute>, reply: FastifyReply<LoginHttpRoute>): Promise<void> {
    const serviceInput: AuthenticatePasswordInput = {
      username: req.body.username,
      password: req.body.password
    };

    const authenticatedUser = await this.service.authenticatePassword(serviceInput);

    const refreshToken = await this.service.createRefreshToken(authenticatedUser.id);

    const accessToken = await reply.jwtSign({
      userId: authenticatedUser.id
    });

    await reply.code(200).send({
      accessToken,
      refreshToken
    });
  }

  async refreshAuthentication(
    req: FastifyRequest<RefreshAuthenticationHttpRoute>,
    reply: FastifyReply<RefreshAuthenticationHttpRoute>
  ): Promise<void> {
    const authentication = await this.service.refreshAuthentication(req.body.refreshToken);

    const accessToken = await reply.jwtSign({
      userId: authentication.userId
    });

    await reply.code(200).send({
      accessToken,
      refreshToken: authentication.refreshToken
    });
  }

  async logout(req: FastifyRequest<LogoutHttpRoute>, reply: FastifyReply<LogoutHttpRoute>): Promise<void> {
    await this.service.revokeRefreshToken(req.body.refreshToken);

    await reply.code(204).send();
  }

  async listApiKeys(
    req: FastifyRequest<ListApiKeysHttpRoute>,
    reply: FastifyReply<ListApiKeysHttpRoute>
  ): Promise<void> {
    const apiKeys = await this.service.listApiKeys(req.auth.userId);

    const res = mapDomainUserApiKeysToHttpListApiKeysResponse(apiKeys);

    await reply.code(200).send(res);
  }

  async createApiKey(
    req: FastifyRequest<CreateApiKeyHttpRoute>,
    reply: FastifyReply<CreateApiKeyHttpRoute>
  ): Promise<void> {
    const serviceInput: CreateUserApiKeyInput = {
      userId: req.auth.userId,

      name: req.body.name,

      expiresAt: req.body.expiresAt
    };

    const apiKeyCreation = await this.service.createApiKey(serviceInput);

    const res = mapCreateApiKeyResultToHttpCreateApiKeyResponse(apiKeyCreation);

    await reply.code(201).send(res);
  }

  async revokeApiKey(
    req: FastifyRequest<RevokeApiKeyHttpRoute>,
    reply: FastifyReply<RevokeApiKeyHttpRoute>
  ): Promise<void> {
    const serviceInput: RevokeUserApiKeyInput = {
      userId: req.auth.userId,

      apiKeyId: req.params.apiKeyId
    };

    const revokedApiKey = await this.service.revokeApiKey(serviceInput);

    const res = mapDomainUserApiKeyToHttpUserApiKeyResponse(revokedApiKey);

    await reply.code(200).send(res);
  }
}

/* exports */

export { UserController };
export type { UserHttpControllerContract };
