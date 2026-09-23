import type { Buffer } from 'node:buffer';

import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { TaskRepositoryContract } from '@/modules/tasks/task.repository';

import type {
  FetchTaskEntriesInternodeInput,
  FetchTaskEntriesInternodeResult,
  FetchTaskPayloadInternodeInput,
  InternodeTaskEntry
} from './master-node.application';

/* contract */

type MasterNodeInternodeServiceContract = {
  fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult>;
  fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer>;
};

/* service */

class MasterNodeInternodeService implements MasterNodeInternodeServiceContract {
  constructor(
    private readonly taskRepository: TaskRepositoryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly byteStorageService: ByteStorageServiceContract
  ) {}

  async fetchTaskEntries(input: FetchTaskEntriesInternodeInput): Promise<FetchTaskEntriesInternodeResult> {
    const consensusState = await this.consensusService.getConsensusState();

    const tasks = await this.taskRepository.listTasksInSequenceRange({
      afterSequence: input.afterSequence,
      upToSequence: consensusState.lastCommittedSequence,
      limit: input.limit
    });

    const entries: InternodeTaskEntry[] = tasks.map((task) => ({
      id: task.id,

      originMasterNodeId: task.originMasterNodeId,
      epoch: task.epoch,
      sequence: task.sequence,

      type: task.type,
      executionScope: task.executionScope,
      data: task.data,

      payloadId: task.payloadId,

      createdAt: task.createdAt
    }));

    return {
      epoch: consensusState.currentEpoch,
      lastCommittedSequence: consensusState.lastCommittedSequence,
      entries
    };
  }

  async fetchTaskPayload(input: FetchTaskPayloadInternodeInput): Promise<Buffer> {
    return this.byteStorageService.retrieve(input.payloadId);
  }
}

/* exports */

export { MasterNodeInternodeService };
export type { MasterNodeInternodeServiceContract };
