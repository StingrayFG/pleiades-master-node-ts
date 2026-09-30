import { z } from 'zod';

/* constants */

export const NODE_ID_PREFIX = 'master-node';

/* field schemas */

export const nodeIdSchema = z.string().regex(new RegExp(`^${NODE_ID_PREFIX}-[0-9a-f]{12}$`));
export const nodeSessionIdSchema = z.uuid();

/* types */

export type NodeId = z.infer<typeof nodeIdSchema>;
export type NodeSessionId = z.infer<typeof nodeSessionIdSchema>;
