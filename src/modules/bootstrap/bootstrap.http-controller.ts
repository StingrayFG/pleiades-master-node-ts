import type { FastifyReply, FastifyRequest } from 'fastify';

import type { BootstrapLeaderHttpRoute } from './bootstrap.http-contracts';
import { mapDomainBootstrapResultToHttpBootstrapResultResponse } from './bootstrap.mappers';
import type { BootstrapServiceContract } from './bootstrap.service';

/* contract */

type BootstrapHttpControllerContract = {
  bootstrapLeader(req: FastifyRequest<BootstrapLeaderHttpRoute>, reply: FastifyReply): Promise<void>;
};

/* controller */

class BootstrapController implements BootstrapHttpControllerContract {
  constructor(private readonly service: BootstrapServiceContract) {}

  async bootstrapLeader(req: FastifyRequest<BootstrapLeaderHttpRoute>, reply: FastifyReply): Promise<void> {
    const bootstrapResult = await this.service.bootstrapAsLeader();

    const res = mapDomainBootstrapResultToHttpBootstrapResultResponse(bootstrapResult);

    await reply.code(200).send(res);
  }
}

/* exports */

export { BootstrapController };
export type { BootstrapHttpControllerContract };
