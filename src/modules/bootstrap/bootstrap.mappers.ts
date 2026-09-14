import { withMapperError } from '@/common/mappers/mappers';

import type { MasterBootstrapResult } from './bootstrap.application';
import type { BootstrapResultResponse } from './bootstrap.http-contracts';

/* domain -> http */

export const mapDomainBootstrapResultToHttpBootstrapResultResponse = (
  result: MasterBootstrapResult
): BootstrapResultResponse => {
  return withMapperError('Failed to map domain bootstrap result to HTTP bootstrap result', () => {
    return {
      role: result.role,
      epoch: result.epoch.toString(),
      leaderMasterId: result.leaderMasterId
    };
  });
};
