/* constants */

const FILE_SYSTEM_CAPACITY_ERROR_CODES = ['ENOSPC', 'EDQUOT'] as const;

/* predicates */

export const hasFileSystemErrorCode = (err: unknown, code: string): err is NodeJS.ErrnoException => {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
};

export const hasFileSystemCapacityError = (err: unknown): boolean => {
  return FILE_SYSTEM_CAPACITY_ERROR_CODES.some((code) => hasFileSystemErrorCode(err, code));
};
