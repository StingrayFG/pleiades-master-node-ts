import { Buffer } from 'node:buffer';

import { z } from 'zod';

import { GenericInternalServerError } from '@/errors/application.errors';
import type { TaskDefinition } from '@/modules/tasks/task.definition';
import type { TaskExecutionScope } from '@/modules/tasks/task.domain';
import type { TaskForwarderContract } from '@/modules/tasks/task.forwarder';

import type { MasterNodeId } from './master-node.domain';
import type { MasterNodeGrpcClientContract } from './master-node.grpc-client';
import type { MasterNodeServiceContract } from './master-node.service';

/* forwarder */

class MasterNodeTaskForwarder implements TaskForwarderContract {
  constructor(
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly masterNodeService: MasterNodeServiceContract
  ) {}

  async forwardTask<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinition<TType, TScope, TData, TPersistedData, TResult>,
    data: TData,
    leaderMasterId: MasterNodeId
  ): Promise<TResult> {
    const leader = await this.masterNodeService.getMasterNodeById(leaderMasterId);

    const result = await this.masterNodeGrpcClient.forwardTask({
      masterNodeEndpoint: {
        hostname: leader.hostname,
        port: leader.port,
        scheme: leader.scheme
      },
      expectedCertificateFingerprint: leader.certificateFingerprint,

      type: definition.type,
      data: Buffer.from(JSON.stringify(z.encode(definition.dataSchema, data)))
    });

    if (result === undefined) {
      return undefined as TResult;
    }

    if (!definition.resultSchema) {
      throw new GenericInternalServerError('The task definition does not declare a result schema');
    }

    return z.decode(definition.resultSchema, JSON.parse(result.toString('utf8')));
  }
}

/* exports */

export { MasterNodeTaskForwarder };
