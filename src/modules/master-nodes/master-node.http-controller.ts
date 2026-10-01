import type { FastifyReply, FastifyRequest } from 'fastify';

import type {
  GetMasterNodeHttpRoute,
  ListMasterNodesHttpRoute,
  SetMasterNodeModeHttpRoute
} from './master-node.http-contracts';
import {
  mapDomainMasterNodeToHttpMasterNodeResponse,
  mapDomainMasterNodesToHttpMasterNodesResponse
} from './master-node.mappers';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeHttpControllerContract = {
  listMasterNodes(
    req: FastifyRequest<ListMasterNodesHttpRoute>,
    reply: FastifyReply<ListMasterNodesHttpRoute>
  ): Promise<void>;
  getMasterNode(
    req: FastifyRequest<GetMasterNodeHttpRoute>,
    reply: FastifyReply<GetMasterNodeHttpRoute>
  ): Promise<void>;
  setMasterNodeMode(
    req: FastifyRequest<SetMasterNodeModeHttpRoute>,
    reply: FastifyReply<SetMasterNodeModeHttpRoute>
  ): Promise<void>;
};

/* controller */

class MasterNodeController implements MasterNodeHttpControllerContract {
  constructor(private readonly service: MasterNodeServiceContract) {}

  async listMasterNodes(
    req: FastifyRequest<ListMasterNodesHttpRoute>,
    reply: FastifyReply<ListMasterNodesHttpRoute>
  ): Promise<void> {
    const masterNodes = await this.service.listMasterNodes();

    const res = mapDomainMasterNodesToHttpMasterNodesResponse(masterNodes);

    await reply.code(200).send(res);
  }

  async getMasterNode(
    req: FastifyRequest<GetMasterNodeHttpRoute>,
    reply: FastifyReply<GetMasterNodeHttpRoute>
  ): Promise<void> {
    const masterNodeId = req.params.masterNodeId;

    const masterNode = await this.service.getMasterNodeById(masterNodeId);

    const res = mapDomainMasterNodeToHttpMasterNodeResponse(masterNode);

    await reply.code(200).send(res);
  }

  async setMasterNodeMode(
    req: FastifyRequest<SetMasterNodeModeHttpRoute>,
    reply: FastifyReply<SetMasterNodeModeHttpRoute>
  ): Promise<void> {
    const masterNodeId = req.params.masterNodeId;

    const masterNode = await this.service.transitionMasterNodeMode(masterNodeId, req.body.mode);

    const res = mapDomainMasterNodeToHttpMasterNodeResponse(masterNode);

    await reply.code(200).send(res);
  }
}

/* exports */

export { MasterNodeController };
export type { MasterNodeHttpControllerContract };
