import type { CallOptions } from '@grpc/grpc-js';

import { DEFAULT_GRPC_DEADLINE_MS } from './grpc-client.constants';

/**/

export const createDefaultGrpcCallOptions = (): CallOptions => ({
  deadline: new Date(Date.now() + DEFAULT_GRPC_DEADLINE_MS)
});
