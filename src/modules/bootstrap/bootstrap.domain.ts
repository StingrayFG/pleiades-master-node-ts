import { z } from 'zod';

/* schemas */

export const masterBootstrapRoleSchema = z.literal('leader');

/* types */

export type MasterBootstrapRole = z.infer<typeof masterBootstrapRoleSchema>;
