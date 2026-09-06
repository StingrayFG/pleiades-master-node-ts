import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  createApiKeyHttpSchema,
  listApiKeysHttpSchema,
  loginHttpSchema,
  logoutHttpSchema,
  refreshAuthenticationHttpSchema,
  revokeApiKeyHttpSchema,
  signupHttpSchema,
  type CreateApiKeyHttpRoute,
  type ListApiKeysHttpRoute,
  type LoginHttpRoute,
  type LogoutHttpRoute,
  type RefreshAuthenticationHttpRoute,
  type RevokeApiKeyHttpRoute,
  type SignupHttpRoute
} from './user.http-contracts';
import type { UserHttpControllerContract } from './user.http-controller';

/* contract */

type UserHttpRoutesDependencies = {
  controller: UserHttpControllerContract;
};

/* routes */

const createUserHttpRoutes = ({ controller }: UserHttpRoutesDependencies): FastifyPluginAsync => {
  return async (app) => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post<SignupHttpRoute>(
      '/auth/signup',
      {
        schema: signupHttpSchema
      },
      (req, reply) => controller.signup(req, reply)
    );

    typedApp.post<LoginHttpRoute>(
      '/auth/login',
      {
        schema: loginHttpSchema
      },
      (req, reply) => controller.login(req, reply)
    );

    typedApp.post<RefreshAuthenticationHttpRoute>(
      '/auth/refresh',
      {
        schema: refreshAuthenticationHttpSchema
      },
      (req, reply) => controller.refreshAuthentication(req, reply)
    );

    typedApp.post<LogoutHttpRoute>(
      '/auth/logout',
      {
        schema: logoutHttpSchema
      },
      (req, reply) => controller.logout(req, reply)
    );

    typedApp.get<ListApiKeysHttpRoute>(
      '/api-keys',
      {
        schema: listApiKeysHttpSchema,
        onRequest: app.JWTAuthMW
      },
      (req, reply) => controller.listApiKeys(req, reply)
    );

    typedApp.post<CreateApiKeyHttpRoute>(
      '/api-keys',
      {
        schema: createApiKeyHttpSchema,
        onRequest: app.JWTAuthMW
      },
      (req, reply) => controller.createApiKey(req, reply)
    );

    typedApp.delete<RevokeApiKeyHttpRoute>(
      '/api-keys/:apiKeyId',
      {
        schema: revokeApiKeyHttpSchema,
        onRequest: app.JWTAuthMW
      },
      (req, reply) => controller.revokeApiKey(req, reply)
    );
  };
};

/* exports */

export { createUserHttpRoutes };
