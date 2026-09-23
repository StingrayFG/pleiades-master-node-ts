import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';

import { GenericBadRequestError, GenericMapperError } from '@/errors/application.errors';
import type {
  FetchTaskEntriesRequest,
  FetchTaskEntriesResponse,
  FetchTaskPayloadRequest,
  FetchTaskPayloadResponse
} from '@/gen/proto/master/v1/master';

import type { MasterNodeInternodeServiceContract } from './master-node.internode-service';
import {
  mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput,
  mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput,
  mapInternodeTaskEntryToGrpcTaskEntry
} from './master-node.mappers';

/* contract */

type MasterNodeGrpcControllerContract = {
  fetchTaskEntries(
    call: ServerUnaryCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>,
    callback: sendUnaryData<FetchTaskEntriesResponse>
  ): Promise<void>;
  fetchTaskPayload(
    call: ServerUnaryCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>,
    callback: sendUnaryData<FetchTaskPayloadResponse>
  ): Promise<void>;
};

/* controller */

class MasterNodeGrpcController implements MasterNodeGrpcControllerContract {
  constructor(private readonly internodeService: MasterNodeInternodeServiceContract) {}

  async fetchTaskEntries(
    call: ServerUnaryCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>,
    callback: sendUnaryData<FetchTaskEntriesResponse>
  ): Promise<void> {
    let input;

    try {
      input = mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput(call.request);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid fetch task entries request', { cause: err });
      }

      throw err;
    }

    const result = await this.internodeService.fetchTaskEntries(input);

    callback(null, {
      epoch: result.epoch.toString(),
      last_committed_sequence: result.lastCommittedSequence.toString(),
      entries: result.entries.map(mapInternodeTaskEntryToGrpcTaskEntry)
    });
  }

  async fetchTaskPayload(
    call: ServerUnaryCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>,
    callback: sendUnaryData<FetchTaskPayloadResponse>
  ): Promise<void> {
    let input;

    try {
      input = mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput(call.request);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid fetch task payload request', { cause: err });
      }

      throw err;
    }

    const payload = await this.internodeService.fetchTaskPayload(input);

    callback(null, {
      payload
    });
  }
}

/* exports */

export { MasterNodeGrpcController };
export type { MasterNodeGrpcControllerContract };
