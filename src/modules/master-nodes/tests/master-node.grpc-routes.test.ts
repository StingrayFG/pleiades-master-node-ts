import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { describe, expect, jest, test } from '@jest/globals';

import type {
  FetchTaskEntriesRequest,
  FetchTaskEntriesResponse,
  FetchTaskPayloadRequest,
  FetchTaskPayloadResponse
} from '@/gen/proto/master/v1/master';

import type { MasterNodeGrpcControllerContract } from '../master-node.grpc-controller';
import { createMasterNodeGrpcRoutes } from '../master-node.grpc-routes';

/* mocks */

const createControllerMock = (): jest.Mocked<MasterNodeGrpcControllerContract> => {
  return {
    fetchTaskEntries: jest.fn<MasterNodeGrpcControllerContract['fetchTaskEntries']>().mockResolvedValue(),
    fetchTaskPayload: jest.fn<MasterNodeGrpcControllerContract['fetchTaskPayload']>().mockResolvedValue()
  };
};

/* tests */

describe('master node gRPC routes', () => {
  test('delegates task-entry requests to the controller', async () => {
    const controller = createControllerMock();
    const routes = createMasterNodeGrpcRoutes({ controller });
    const call = {
      request: { after_sequence: '-1', limit: 32 }
    } as ServerUnaryCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>;
    const callback = jest.fn<sendUnaryData<FetchTaskEntriesResponse>>();
    const handler = routes.masterService.fetchTaskEntries as MasterNodeGrpcControllerContract['fetchTaskEntries'];

    await handler(call, callback);

    expect(controller.fetchTaskEntries).toHaveBeenCalledWith(call, callback);
  });

  test('delegates task-payload requests to the controller', async () => {
    const controller = createControllerMock();
    const routes = createMasterNodeGrpcRoutes({ controller });
    const call = {
      request: { payload_id: '00000000-0000-4000-8000-000000000003' }
    } as ServerUnaryCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>;
    const callback = jest.fn<sendUnaryData<FetchTaskPayloadResponse>>();
    const handler = routes.masterService.fetchTaskPayload as MasterNodeGrpcControllerContract['fetchTaskPayload'];

    await handler(call, callback);

    expect(controller.fetchTaskPayload).toHaveBeenCalledWith(call, callback);
  });
});
