import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { describe, expect, jest, test } from '@jest/globals';

import type {
  FetchTaskEntriesRequest,
  FetchTaskEntriesResponse,
  FetchTaskPayloadRequest,
  FetchTaskPayloadResponse,
  RecordLeaderHeartbeatRequest,
  RecordLeaderHeartbeatResponse,
  RegisterMasterNodeRequest,
  RegisterMasterNodeResponse,
  RequestPreVoteRequest,
  RequestPreVoteResponse,
  RequestVoteRequest,
  RequestVoteResponse
} from '@/gen/proto/master/v1/master';

import type { MasterNodeGrpcControllerContract } from '../master-node.grpc-controller';
import { createMasterNodeGrpcRoutes } from '../master-node.grpc-routes';

/* mocks */

const createControllerMock = (): jest.Mocked<MasterNodeGrpcControllerContract> => {
  return {
    fetchMasterInfo: jest.fn<MasterNodeGrpcControllerContract['fetchMasterInfo']>().mockResolvedValue(),
    registerMasterNode: jest.fn<MasterNodeGrpcControllerContract['registerMasterNode']>().mockResolvedValue(),
    fetchClusterMembershipSnapshot: jest
      .fn<MasterNodeGrpcControllerContract['fetchClusterMembershipSnapshot']>()
      .mockResolvedValue(),
    fetchTaskEntries: jest.fn<MasterNodeGrpcControllerContract['fetchTaskEntries']>().mockResolvedValue(),
    fetchTaskPayload: jest.fn<MasterNodeGrpcControllerContract['fetchTaskPayload']>().mockResolvedValue(),
    forwardTask: jest.fn<MasterNodeGrpcControllerContract['forwardTask']>().mockResolvedValue(),
    requestPreVote: jest.fn<MasterNodeGrpcControllerContract['requestPreVote']>().mockResolvedValue(),
    requestVote: jest.fn<MasterNodeGrpcControllerContract['requestVote']>().mockResolvedValue(),
    recordLeaderHeartbeat: jest.fn<MasterNodeGrpcControllerContract['recordLeaderHeartbeat']>().mockResolvedValue()
  };
};

/* tests */

describe('master node gRPC routes', () => {
  test('delegates master registration requests to the controller', async () => {
    const controller = createControllerMock();
    const routes = createMasterNodeGrpcRoutes({ controller });
    const call = {
      request: {
        master_id: 'master-node-bbbbbbbbbbbb',
        session_id: '00000000-0000-4000-8000-000000000004',
        cluster_id: '00000000-0000-4000-8000-000000000010',
        hostname: 'follower.internal',
        port: 4410,
        scheme: 'grpcs'
      }
    } as ServerUnaryCall<RegisterMasterNodeRequest, RegisterMasterNodeResponse>;
    const callback = jest.fn<sendUnaryData<RegisterMasterNodeResponse>>();
    const handler = routes.masterService.registerMasterNode as MasterNodeGrpcControllerContract['registerMasterNode'];

    await handler(call, callback);

    expect(controller.registerMasterNode).toHaveBeenCalledWith(call, callback);
  });

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

  test('delegates pre-vote requests to the controller', async () => {
    const controller = createControllerMock();
    const routes = createMasterNodeGrpcRoutes({ controller });
    const call = {
      request: {
        prospective_epoch: '3',
        last_log_sequence: '4',
        caller_master_id: 'master-node-bbbbbbbbbbbb',
        caller_session_id: '00000000-0000-4000-8000-000000000004',
        last_log_epoch: '2'
      }
    } as ServerUnaryCall<RequestPreVoteRequest, RequestPreVoteResponse>;
    const callback = jest.fn<sendUnaryData<RequestPreVoteResponse>>();
    const handler = routes.masterService.requestPreVote as MasterNodeGrpcControllerContract['requestPreVote'];

    await handler(call, callback);

    expect(controller.requestPreVote).toHaveBeenCalledWith(call, callback);
  });

  test('delegates vote requests to the controller', async () => {
    const controller = createControllerMock();
    const routes = createMasterNodeGrpcRoutes({ controller });
    const call = {
      request: {
        epoch: '3',
        last_log_sequence: '4',
        caller_master_id: 'master-node-bbbbbbbbbbbb',
        caller_session_id: '00000000-0000-4000-8000-000000000004',
        last_log_epoch: '2'
      }
    } as ServerUnaryCall<RequestVoteRequest, RequestVoteResponse>;
    const callback = jest.fn<sendUnaryData<RequestVoteResponse>>();
    const handler = routes.masterService.requestVote as MasterNodeGrpcControllerContract['requestVote'];

    await handler(call, callback);

    expect(controller.requestVote).toHaveBeenCalledWith(call, callback);
  });

  test('delegates leader heartbeats to the controller', async () => {
    const controller = createControllerMock();
    const routes = createMasterNodeGrpcRoutes({ controller });
    const call = {
      request: {
        epoch: '3',
        last_committed_sequence: '4',
        caller_master_id: 'master-node-aaaaaaaaaaaa',
        caller_session_id: '00000000-0000-4000-8000-000000000004'
      }
    } as ServerUnaryCall<RecordLeaderHeartbeatRequest, RecordLeaderHeartbeatResponse>;
    const callback = jest.fn<sendUnaryData<RecordLeaderHeartbeatResponse>>();
    const handler = routes.masterService
      .recordLeaderHeartbeat as MasterNodeGrpcControllerContract['recordLeaderHeartbeat'];

    await handler(call, callback);

    expect(controller.recordLeaderHeartbeat).toHaveBeenCalledWith(call, callback);
  });
});
