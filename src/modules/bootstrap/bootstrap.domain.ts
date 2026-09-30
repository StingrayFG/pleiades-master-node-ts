import { z } from 'zod';

/* constants */

export const MASTER_BOOTSTRAP_ROLES = ['leader', 'follower'] as const;

/* field schemas */

export const masterBootstrapRoleSchema = z.enum(MASTER_BOOTSTRAP_ROLES);

/* field types */

export type MasterBootstrapRole = z.infer<typeof masterBootstrapRoleSchema>;
