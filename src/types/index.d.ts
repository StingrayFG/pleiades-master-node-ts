import type { FastifyReply } from 'fastify';

import { JwtPayload } from '@/plugins/jwt/jwt.types';
import { UserId, UserApiKeyId } from '@/modules/users/user.domain';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      userId: UserId;
      authType: 'jwt' | 'api-key';
      apiKeyId?: UserApiKeyId;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;

    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    JWTAuthMW: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export {};
