import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';

import { GenericBadRequestError, GenericMapperError } from '@/errors/application.errors';
import type {
  RecordDataNodeHeartbeatRequest,
  RecordDataNodeHeartbeatResponse,
  RegisterDataNodeRequest,
  RegisterDataNodeResponse
} from '@/gen/proto/membership/v1/membership';
import { getGrpcPeerCertificateFingerprint } from '@/transports/grpc/server/auth/grpc-peer-auth';

import type { HeartbeatDataNodeInput, RegisterDataNodeInput } from './data-node.application';
import {
  mapGrpcRecordDataNodeHeartbeatRequestToHeartbeatDataNodeInput,
  mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput
} from './data-node.mappers';
import type { DataNodeServiceContract } from './data-node.service';

/* contract */

type DataNodeGrpcControllerContract = {
  registerDataNode(
    call: ServerUnaryCall<RegisterDataNodeRequest, RegisterDataNodeResponse>,
    callback: sendUnaryData<RegisterDataNodeResponse>
  ): Promise<void>;
  recordDataNodeHeartbeat(
    call: ServerUnaryCall<RecordDataNodeHeartbeatRequest, RecordDataNodeHeartbeatResponse>,
    callback: sendUnaryData<RecordDataNodeHeartbeatResponse>
  ): Promise<void>;
};

/* controller */

class DataNodeGrpcController implements DataNodeGrpcControllerContract {
  constructor(private readonly service: DataNodeServiceContract) {}

  async registerDataNode(
    call: ServerUnaryCall<RegisterDataNodeRequest, RegisterDataNodeResponse>,
    callback: sendUnaryData<RegisterDataNodeResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let serviceInput: RegisterDataNodeInput;

    try {
      serviceInput = mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput(call.request, certificateFingerprint);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid register data node request', { cause: err });
      }

      throw err;
    }

    const sessionId = await this.service.registerDataNode(serviceInput);

    callback(null, {
      session_id: sessionId
    });
  }

  async recordDataNodeHeartbeat(
    call: ServerUnaryCall<RecordDataNodeHeartbeatRequest, RecordDataNodeHeartbeatResponse>,
    callback: sendUnaryData<RecordDataNodeHeartbeatResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let serviceInput: HeartbeatDataNodeInput;

    try {
      serviceInput = mapGrpcRecordDataNodeHeartbeatRequestToHeartbeatDataNodeInput(
        call.request,
        certificateFingerprint
      );
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid record data node heartbeat request', { cause: err });
      }

      throw err;
    }

    await this.service.applyDataNodeHeartbeat(serviceInput);

    callback(null, {});
  }
}

/* exports */

export { DataNodeGrpcController };
export type { DataNodeGrpcControllerContract };
