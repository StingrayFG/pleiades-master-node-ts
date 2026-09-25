import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { describe, expect, jest, test } from '@jest/globals';

import { GenericBadRequestError } from '@/errors/application.errors';
import {
  TaskExecutionScope,
  type FetchTaskEntriesRequest,
  type FetchTaskEntriesResponse,
  type FetchTaskPayloadRequest,
  type FetchTaskPayloadResponse,
  type RegisterMasterNodeRequest,
  type RegisterMasterNodeResponse
} from '@/gen/proto/master/v1/master';

import type { InternodeTaskEntry } from '../master-node.application';
import { MasterNodeGrpcController } from '../master-node.grpc-controller';
import type { MasterNodeInternodeServiceContract } from '../master-node.internode-service';

/* fixtures */

const payloadId = '00000000-0000-4000-8000-000000000003';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const callerMasterNodeId = 'master-node-follower';
const callerSessionId = '00000000-0000-4000-8000-000000000004';
const peerCertificate = Buffer.from('peer certificate');
const callerCertificateFingerprint = createHash('sha256').update(peerCertificate).digest('hex');

const entry: InternodeTaskEntry = {
  id: '00000000-0000-4000-8000-000000000002',
  originMasterNodeId: 'master-node-a',
  epoch: 2n,
  sequence: 4n,
  type: 'bucket.create',
  executionScope: 'cluster',
  data: { bucketName: 'test-bucket' },
  payloadId,
  createdAt
};

/* helpers */

const createCall = <TRequest, TResponse>(request: TRequest): ServerUnaryCall<TRequest, TResponse> => {
  return {
    request,
    getAuthContext: () => ({ sslPeerCertificate: { raw: peerCertificate } })
  } as unknown as ServerUnaryCall<TRequest, TResponse>;
};

/* mocks */

const createInternodeServiceMock = (): jest.Mocked<MasterNodeInternodeServiceContract> => {
  const service = {
    fetchMasterInfo: jest.fn<MasterNodeInternodeServiceContract['fetchMasterInfo']>(),
    registerMasterNode: jest.fn<MasterNodeInternodeServiceContract['registerMasterNode']>(),
    fetchTaskEntries: jest.fn<MasterNodeInternodeServiceContract['fetchTaskEntries']>(),
    fetchTaskPayload: jest.fn<MasterNodeInternodeServiceContract['fetchTaskPayload']>()
  };

  service.fetchTaskEntries.mockResolvedValue({
    epoch: 2n,
    lastCommittedSequence: 4n,
    entries: [entry]
  });
  service.fetchTaskPayload.mockResolvedValue(Buffer.from('task payload'));

  return service;
};

/* tests */

describe('MasterNodeGrpcController', () => {
  test('fetches task entries and maps the response to gRPC', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskEntriesResponse>>();

    await controller.fetchTaskEntries(
      createCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>({
        after_sequence: '-1',
        limit: 32,
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(service.fetchTaskEntries).toHaveBeenCalledWith({
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint,
      afterSequence: -1n,
      limit: 32
    });
    expect(callback).toHaveBeenCalledWith(null, {
      epoch: '2',
      last_committed_sequence: '4',
      entries: [
        {
          id: entry.id,
          origin_master_id: entry.originMasterNodeId,
          epoch: '2',
          sequence: '4',
          type: entry.type,
          execution_scope: TaskExecutionScope.TASK_EXECUTION_SCOPE_CLUSTER,
          data: Buffer.from(JSON.stringify(entry.data)),
          payload_id: payloadId,
          created_at: createdAt
        }
      ]
    });
  });

  test('rejects invalid task-entry requests as bad requests', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskEntriesResponse>>();

    await expect(
      controller.fetchTaskEntries(
        createCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>({
          after_sequence: '-2',
          limit: 0,
          caller_master_id: callerMasterNodeId,
          caller_session_id: callerSessionId
        }),
        callback
      )
    ).rejects.toBeInstanceOf(GenericBadRequestError);
    expect(service.fetchTaskEntries).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  test('fetches task payload bytes', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskPayloadResponse>>();

    await controller.fetchTaskPayload(
      createCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>({
        payload_id: payloadId,
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(service.fetchTaskPayload).toHaveBeenCalledWith({
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint,
      payloadId
    });
    expect(callback).toHaveBeenCalledWith(null, {
      payload: Buffer.from('task payload')
    });
  });

  test('rejects invalid task payload requests as bad requests', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskPayloadResponse>>();

    await expect(
      controller.fetchTaskPayload(
        createCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>({
          payload_id: 'invalid',
          caller_master_id: callerMasterNodeId,
          caller_session_id: callerSessionId
        }),
        callback
      )
    ).rejects.toBeInstanceOf(GenericBadRequestError);
    expect(service.fetchTaskPayload).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  test('registers a master node using the presented certificate fingerprint', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RegisterMasterNodeResponse>>();

    await controller.registerMasterNode(
      createCall<RegisterMasterNodeRequest, RegisterMasterNodeResponse>({
        master_id: callerMasterNodeId,
        session_id: callerSessionId,
        cluster_id: '00000000-0000-4000-8000-000000000010',
        hostname: 'follower.internal',
        port: 4410,
        scheme: 'grpcs'
      }),
      callback
    );

    expect(service.registerMasterNode).toHaveBeenCalledWith({
      id: callerMasterNodeId,
      certificateFingerprint: callerCertificateFingerprint,
      sessionId: callerSessionId,
      clusterId: '00000000-0000-4000-8000-000000000010',
      endpoint: {
        hostname: 'follower.internal',
        port: 4410,
        scheme: 'grpcs'
      }
    });
    expect(callback).toHaveBeenCalledWith(null, {});
  });
});
