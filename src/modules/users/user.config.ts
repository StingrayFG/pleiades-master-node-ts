/* types */

export type UserApiKeyConfig = {
  prefix: string;
  secretSizeBytes: number;
};

export type UserRefreshTokenConfig = {
  prefix: string;
  secretSizeBytes: number;
  ttlMs: number;
};

export type UserConfig = {
  apiKey: UserApiKeyConfig;
  refreshToken: UserRefreshTokenConfig;
};

/* config */

export const userConfig: UserConfig = {
  apiKey: {
    prefix: 's3k',
    secretSizeBytes: 32
  },

  refreshToken: {
    prefix: 's3r',
    secretSizeBytes: 32,
    ttlMs: 30 * 24 * 60 * 60 * 1000
  }
};
