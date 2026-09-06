import type { UserId } from '@/modules/users/user.domain';

/**/

export type JwtPayload = {
  userId: UserId;
};
