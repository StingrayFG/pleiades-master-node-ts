import { describe, expect, test } from '@jest/globals';

import { updateConsensusVotingConfigurationTaskDataSchema } from '../consensus.tasks';

/* fixtures */

const masterNodeA = 'master-node-aaaaaaaaaaaa';
const masterNodeB = 'master-node-bbbbbbbbbbbb';
const sessionId = '00000000-0000-4000-8000-000000000001';

/* tests */

describe('consensus task schemas', () => {
  test('accepts activation with a stable configuration containing the master node', () => {
    const data = {
      configuration: {
        phase: 'stable' as const,
        voterMasterNodeIds: [masterNodeA, masterNodeB]
      },
      activateMasterNode: {
        id: masterNodeB,
        sessionId
      }
    };

    expect(updateConsensusVotingConfigurationTaskDataSchema.parse(data)).toEqual(data);
  });

  test('rejects activation during the joint configuration phase', () => {
    expect(() =>
      updateConsensusVotingConfigurationTaskDataSchema.parse({
        configuration: {
          phase: 'joint',
          previousVoterMasterNodeIds: [masterNodeA],
          nextVoterMasterNodeIds: [masterNodeA, masterNodeB]
        },
        activateMasterNode: {
          id: masterNodeB,
          sessionId
        }
      })
    ).toThrow();
  });

  test('rejects activation outside the stable voting configuration', () => {
    expect(() =>
      updateConsensusVotingConfigurationTaskDataSchema.parse({
        configuration: {
          phase: 'stable',
          voterMasterNodeIds: [masterNodeA]
        },
        activateMasterNode: {
          id: masterNodeB,
          sessionId
        }
      })
    ).toThrow();
  });
});
