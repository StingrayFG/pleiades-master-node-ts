import { GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { InternodeTaskEntry } from './master-node.application';
import type { MasterNodeConfig } from './master-node.config';
import type { MasterNodeCertificateFingerprint, MasterNodeEndpoint, MasterNodeId } from './master-node.domain';
import type { MasterNodeGrpcClientContract } from './master-node.grpc-client';
import type { MasterNodeServiceContract } from './master-node.service';

/* contract */

type MasterNodeReplicationHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class MasterNodeReplicationHandler implements MasterNodeReplicationHandlerContract {
  constructor(
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly taskService: TaskServiceContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly masterNodeConfig: MasterNodeConfig
  ) {}

  async run(): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId === null || consensusState.leaderMasterId === this.selfMasterNodeId) {
      return;
    }

    const leader = await this.masterNodeService.getMasterNodeById(consensusState.leaderMasterId);

    const leaderEndpoint: MasterNodeEndpoint = {
      hostname: leader.hostname,
      port: leader.port,
      scheme: leader.scheme
    };

    const fetchResult = await this.masterNodeGrpcClient.fetchTaskEntries({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leader.certificateFingerprint,
      afterSequence: consensusState.lastCommittedSequence,
      limit: this.masterNodeConfig.replication.batchSize
    });

    if (fetchResult.epoch < consensusState.currentEpoch) {
      throw new GenericFailedPreconditionError('The leader returned a stale consensus epoch');
    }

    if (fetchResult.lastCommittedSequence < consensusState.lastCommittedSequence) {
      throw new GenericFailedPreconditionError('The leader returned a regressed committed sequence');
    }

    if (fetchResult.entries.length > this.masterNodeConfig.replication.batchSize) {
      throw new GenericFailedPreconditionError('The leader returned more task entries than requested');
    }

    await this.consensusService.acceptFollowership(consensusState.leaderMasterId, fetchResult.epoch);

    let replicatedThroughSequence = consensusState.lastCommittedSequence;

    for (const entry of fetchResult.entries) {
      if (entry.sequence !== replicatedThroughSequence + 1n) {
        throw new GenericFailedPreconditionError('The leader returned a non-contiguous task sequence');
      }

      if (entry.sequence > fetchResult.lastCommittedSequence) {
        throw new GenericFailedPreconditionError('The leader returned an uncommitted task entry');
      }

      try {
        await this.replicateEntry(leaderEndpoint, leader.certificateFingerprint, entry);
      } catch (err) {
        if (!(err instanceof GenericConflictError)) {
          throw err;
        }

        await this.taskService.deleteTasksFromSequence(entry.sequence);
        await this.replicateEntry(leaderEndpoint, leader.certificateFingerprint, entry);
      }

      replicatedThroughSequence = entry.sequence;
    }

    if (
      replicatedThroughSequence === fetchResult.lastCommittedSequence &&
      consensusState.lastAllocatedSequence > fetchResult.lastCommittedSequence
    ) {
      await this.taskService.deleteTasksFromSequence(fetchResult.lastCommittedSequence + 1n);
    }

    const nextCommittedSequence =
      replicatedThroughSequence < fetchResult.lastCommittedSequence
        ? replicatedThroughSequence
        : fetchResult.lastCommittedSequence;

    if (nextCommittedSequence > consensusState.lastCommittedSequence) {
      await this.consensusService.advanceLastCommittedSequence(nextCommittedSequence);
    }
  }

  private async replicateEntry(
    masterNodeEndpoint: MasterNodeEndpoint,
    expectedCertificateFingerprint: MasterNodeCertificateFingerprint,
    entry: InternodeTaskEntry
  ): Promise<void> {
    const payload =
      entry.payloadId === null
        ? undefined
        : await this.masterNodeGrpcClient.fetchTaskPayload({
            masterNodeEndpoint,
            expectedCertificateFingerprint,
            payloadId: entry.payloadId
          });

    await this.taskService.replicateTask({
      ...entry,
      payload
    });
  }
}

/* exports */

export { MasterNodeReplicationHandler };
export type { MasterNodeReplicationHandlerContract };
