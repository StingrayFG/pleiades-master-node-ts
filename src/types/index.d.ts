declare module 'fastify' {
  interface FastifyInstance {
    JWTAuthMW: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export {};
