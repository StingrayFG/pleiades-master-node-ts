import { z } from 'zod';

/* field schemas */

export const MASTER_BOOTSTRAP_ROLES = ['leader', 'follower'] as const;

export const masterBootstrapRoleSchema = z.enum(MASTER_BOOTSTRAP_ROLES);

/* types */

export type MasterBootstrapRole = z.infer<typeof masterBootstrapRoleSchema>;
