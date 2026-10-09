import { z } from 'zod';

import { createTaskDefinition } from '@/modules/tasks/task.definition';
import { masterNodeIdSchema, masterNodeSessionIdSchema } from '@/modules/master-nodes/master-node.domain';

import { consensusVotingConfigurationSchema } from './consensus.domain';

/* data schemas */

export const updateConsensusVotingConfigurationTaskDataSchema = z
  .object({
    configuration: consensusVotingConfigurationSchema,
    activateMasterNode: z
      .object({
        id: masterNodeIdSchema,
        sessionId: masterNodeSessionIdSchema
      })
      .optional()
  })
  .superRefine((data, context) => {
    if (data.configuration.phase === 'joint' && data.activateMasterNode) {
      context.addIssue({
        code: 'custom',
        message: 'A joint voting configuration cannot activate a master node',
        path: ['activateMasterNode']
      });
    }

    if (
      data.configuration.phase === 'stable' &&
      data.activateMasterNode &&
      !data.configuration.voterMasterNodeIds.includes(data.activateMasterNode.id)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'An activated master node must belong to the stable voting configuration',
        path: ['activateMasterNode', 'id']
      });
    }
  });

/* definitions */

export const updateConsensusVotingConfigurationTaskDefinition = createTaskDefinition({
  type: 'consensus.update-voting-configuration',
  executionScope: 'cluster',
  forwardable: false,

  dataSchema: updateConsensusVotingConfigurationTaskDataSchema
});
