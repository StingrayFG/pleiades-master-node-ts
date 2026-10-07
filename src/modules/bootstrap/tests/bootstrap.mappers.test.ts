import { describe, expect, test } from '@jest/globals';

import type { MasterBootstrapResult } from '../bootstrap.application';
import { mapDomainBootstrapResultToHttpBootstrapResultResponse } from '../bootstrap.mappers';

/* tests */

describe('bootstrap mappers', () => {
  test('maps a bootstrap result to its HTTP representation', () => {
    const result: MasterBootstrapResult = {
      role: 'leader',
      epoch: 4n,
      leaderMasterId: 'master-node-aaaaaaaaaaaa'
    };

    expect(mapDomainBootstrapResultToHttpBootstrapResultResponse(result)).toEqual({
      role: 'leader',
      epoch: '4',
      leaderMasterId: result.leaderMasterId
    });
  });
});
