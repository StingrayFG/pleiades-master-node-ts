import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { describe, expect, jest, test } from '@jest/globals';

import { GenericBadRequestError, GenericUnauthorizedError } from '@/errors/application.errors';
import type {
  RecordDataNodeHeartbeatRequest,
  RecordDataNodeHeartbeatResponse,
  RegisterDataNodeRequest,
  RegisterDataNodeResponse
} from '@/gen/proto/membership/v1/membership';
import { HealthSnapshotStatus, type HealthSnapshot as GrpcHealthSnapshot } from '@/gen/proto/status/v1/status';

import { DataNodeGrpcController } from '../data-node.grpc-controller';
import type { DataNodeServiceContract } from '../data-node.service';

/* fixtures */

const certificate = Buffer.from('authenticated-peer-certificate');
const certificateFingerprint = createHash('sha256').update(certificate).digest('hex');
const sessionId = '00000000-0000-4000-8000-000000000001';

const grpcHealthSnapshot: GrpcHealthSnapshot = {
  status: HealthSnapshotStatus.HEALTH_SNAPSHOT_STATUS_HEALTHY,
  database_ok: true,
  storage_ok: true,
  storage_total_bytes: '1000',
  storage_free_bytes: '400',
  message: 'healthy'
};

const registerRequest: RegisterDataNodeRequest = {
  node_id: 'data-node-1',
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs',
  health_snapshot: grpcHealthSnapshot
};

const heartbeatRequest: RecordDataNodeHeartbeatRequest = {
  node_id: 'data-node-1',
  session_id: sessionId,
  heartbeat_sequence: '3',
  health_snapshot: grpcHealthSnapshot
};

/* helpers */

const createCall = <TRequest, TResponse>(
  request: TRequest,
  peerCertificate: Buffer | null = certificate
): ServerUnaryCall<TRequest, TResponse> => {
  return {
    request,
    getAuthContext: () => ({
      sslPeerCertificate: peerCertificate
        ? {
            raw: peerCertificate
          }
        : undefined
    })
  } as unknown as ServerUnaryCall<TRequest, TResponse>;
};

/* mocks */

const createDataNodeServiceMock = (): jest.Mocked<DataNodeServiceContract> => {
  const service = {
    listAvailableDataNodes: jest.fn<DataNodeServiceContract['listAvailableDataNodes']>(),
    getDataNodeById: jest.fn<DataNodeServiceContract['getDataNodeById']>(),
    registerDataNode: jest.fn<DataNodeServiceContract['registerDataNode']>(),
    applyDataNodeHeartbeat: jest.fn<DataNodeServiceContract['applyDataNodeHeartbeat']>(),
    checkDataNodeHealth: jest.fn<DataNodeServiceContract['checkDataNodeHealth']>()
  };

  service.registerDataNode.mockResolvedValue(sessionId);
  service.applyDataNodeHeartbeat.mockResolvedValue(undefined);

  return service;
};

/* tests */

describe('DataNodeGrpcController', () => {
  test('registers a data node using its authenticated certificate fingerprint', async () => {
    const service = createDataNodeServiceMock();
    const controller = new DataNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RegisterDataNodeResponse>>();

    await controller.registerDataNode(createCall(registerRequest), callback);

    expect(service.registerDataNode).toHaveBeenCalledWith({
      id: 'data-node-1',
      certificateFingerprint,
      endpoint: {
        hostname: 'data-node.internal',
        port: 50051,
        scheme: 'grpcs'
      },
      healthSnapshot: {
        status: 'healthy',
        databaseOk: true,
        storageOk: true,
        storageTotalBytes: 1_000n,
        storageFreeBytes: 400n,
        message: 'healthy'
      }
    });
    expect(callback).toHaveBeenCalledWith(null, {
      session_id: sessionId
    });
  });

  test('records a heartbeat using its authenticated certificate fingerprint', async () => {
    const service = createDataNodeServiceMock();
    const controller = new DataNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RecordDataNodeHeartbeatResponse>>();

    await controller.recordDataNodeHeartbeat(createCall(heartbeatRequest), callback);

    expect(service.applyDataNodeHeartbeat).toHaveBeenCalledWith({
      id: 'data-node-1',
      certificateFingerprint,
      sessionId,
      heartbeatSequence: 3n,
      healthSnapshot: {
        status: 'healthy',
        databaseOk: true,
        storageOk: true,
        storageTotalBytes: 1_000n,
        storageFreeBytes: 400n,
        message: 'healthy'
      }
    });
    expect(callback).toHaveBeenCalledWith(null, {});
  });

  test('converts invalid registration requests to bad-request errors', async () => {
    const service = createDataNodeServiceMock();
    const controller = new DataNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RegisterDataNodeResponse>>();

    await expect(
      controller.registerDataNode(
        createCall({
          ...registerRequest,
          health_snapshot: undefined
        }),
        callback
      )
    ).rejects.toBeInstanceOf(GenericBadRequestError);
    expect(service.registerDataNode).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  test('rejects calls without an authenticated peer certificate', async () => {
    const service = createDataNodeServiceMock();
    const controller = new DataNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RegisterDataNodeResponse>>();

    await expect(controller.registerDataNode(createCall(registerRequest, null), callback)).rejects.toBeInstanceOf(
      GenericUnauthorizedError
    );
    expect(service.registerDataNode).not.toHaveBeenCalled();
  });
});
