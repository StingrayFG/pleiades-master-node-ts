import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';

import type { HeartbeatDataNodeRequest, HeartbeatDataNodeResponse } from '@/gen/proto/heartbeat/v1/heartbeat';
import type { RegisterDataNodeRequest, RegisterDataNodeResponse } from '@/gen/proto/register/v1/register';
import { GenericBadRequestError, GenericMappingError } from '@/errors/application.errors';

import { HeartbeatDataNodeInput, RegisterDataNodeInput } from './data-node.application';
import {
  mapGrpcHeartbeatDataNodeRequestToHeartbeatDataNodeInput,
  mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput
} from './data-node.mappers';
import type { DataNodeServiceContract } from './data-node.service';

/**/

type DataNodeGrpcControllerContract = {
  registerDataNode(
    call: ServerUnaryCall<RegisterDataNodeRequest, RegisterDataNodeResponse>,
    callback: sendUnaryData<RegisterDataNodeResponse>
  ): Promise<void>;
  heartbeatDataNode(
    call: ServerUnaryCall<HeartbeatDataNodeRequest, HeartbeatDataNodeResponse>,
    callback: sendUnaryData<HeartbeatDataNodeResponse>
  ): Promise<void>;
};

/**/

class DataNodeGrpcController implements DataNodeGrpcControllerContract {
  constructor(private readonly service: DataNodeServiceContract) {}

  async registerDataNode(
    call: ServerUnaryCall<RegisterDataNodeRequest, RegisterDataNodeResponse>,
    callback: sendUnaryData<RegisterDataNodeResponse>
  ): Promise<void> {
    let serviceInput: RegisterDataNodeInput;

    try {
      serviceInput = mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput(call.request);
    } catch (err) {
      if (err instanceof GenericMappingError) {
        throw new GenericBadRequestError('Invalid register data node request', { cause: err });
      }

      throw err;
    }

    await this.service.registerDataNode(serviceInput);

    callback(null, {});
  }

  async heartbeatDataNode(
    call: ServerUnaryCall<HeartbeatDataNodeRequest, HeartbeatDataNodeResponse>,
    callback: sendUnaryData<HeartbeatDataNodeResponse>
  ): Promise<void> {
    let serviceInput: HeartbeatDataNodeInput;

    try {
      serviceInput = mapGrpcHeartbeatDataNodeRequestToHeartbeatDataNodeInput(call.request);
    } catch (err) {
      if (err instanceof GenericMappingError) {
        throw new GenericBadRequestError('Invalid register data node request', { cause: err });
      }

      throw err;
    }

    await this.service.heartbeatDataNode(serviceInput);

    callback(null, {});
  }
}

/**/

export { DataNodeGrpcController };

export type { DataNodeGrpcControllerContract };
