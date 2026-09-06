import { userConfig } from './user.config';
import { type UserRefreshTokenId, userRefreshTokenIdSchema } from './user.domain';

/* parsers */

export const parseUserRefreshToken = (
  token: string
): {
  id: UserRefreshTokenId;
  secret: string;
} | null => {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [prefix, rawId, secret] = parts;

  if (prefix !== userConfig.refreshToken.prefix || !secret) {
    return null;
  }

  const idResult = userRefreshTokenIdSchema.safeParse(rawId);

  if (!idResult.success) {
    return null;
  }

  return {
    id: idResult.data,
    secret
  };
};
