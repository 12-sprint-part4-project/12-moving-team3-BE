export type UserAuthRole = 'CUSTOMER' | 'MOVER';
export type AuthRole = UserAuthRole | 'ADMIN';

export const ADMIN_TOKEN_SUB_PREFIX = 'admin:';

export const isUserAuthRole = (value: unknown): value is UserAuthRole =>
  value === 'CUSTOMER' || value === 'MOVER';

export const toAdminTokenSub = (adminId: number): string =>
  `${ADMIN_TOKEN_SUB_PREFIX}${adminId}`;

/** 관리자 JWT sub(`admin:{id}`)를 AdminUser.id로 바꾼다. */
export const parseAdminTokenSub = (sub: unknown): number | null => {
  if (typeof sub !== 'string' || !sub.startsWith(ADMIN_TOKEN_SUB_PREFIX)) {
    return null;
  }

  const rawId = sub.slice(ADMIN_TOKEN_SUB_PREFIX.length);

  if (!/^[1-9]\d*$/.test(rawId)) {
    return null;
  }

  const adminId = Number(rawId);

  if (!Number.isSafeInteger(adminId)) {
    return null;
  }

  return adminId;
};
