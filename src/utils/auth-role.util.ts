export type UserAuthRole = 'CUSTOMER' | 'MOVER';
export type AuthRole = UserAuthRole | 'ADMIN';

export const ADMIN_TOKEN_SUB_PREFIX = 'admin:';

export const isUserAuthRole = (value: unknown): value is UserAuthRole =>
  value === 'CUSTOMER' || value === 'MOVER';

export const toAdminTokenSub = (adminId: number): string =>
  `${ADMIN_TOKEN_SUB_PREFIX}${adminId}`;

/**
 * 관리자 JWT sub를 AdminUser.id로 바꾼다.
 * 신규 토큰은 `admin:{id}`, 기존 토큰은 숫자(또는 숫자 문자열)다.
 */
export const parseAdminTokenSub = (sub: unknown): number | null => {
  if (typeof sub === 'number') {
    if (!Number.isSafeInteger(sub) || sub <= 0) {
      return null;
    }

    return sub;
  }

  if (typeof sub !== 'string') {
    return null;
  }

  if (sub.startsWith(ADMIN_TOKEN_SUB_PREFIX)) {
    const rawId = sub.slice(ADMIN_TOKEN_SUB_PREFIX.length);

    if (!/^[1-9]\d*$/.test(rawId)) {
      return null;
    }

    const adminId = Number(rawId);

    if (!Number.isSafeInteger(adminId)) {
      return null;
    }

    return adminId;
  }

  if (!/^[1-9]\d*$/.test(sub)) {
    return null;
  }

  const legacyAdminId = Number(sub);

  if (!Number.isSafeInteger(legacyAdminId)) {
    return null;
  }

  return legacyAdminId;
};
