import { z } from 'zod';

/* field schemas */

export const nodeIdSchema = z.string().regex(/^master-node-[0-9a-f]{12}$/);

/* types */

export type NodeId = z.infer<typeof nodeIdSchema>;
