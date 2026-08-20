import type { DeviceType } from '@prisma/client';
import * as authService from './auth.service';
import type {
  AdminLoginServiceResult,
  AdminMeServiceResult,
  RefreshAdminTokenResult,
} from './auth.service';

export type {
  AdminLoginServiceInput,
  AdminLoginServiceResult,
  AdminMeServiceResult,
  AdminRefreshTokenRecord,
  RefreshAdminTokenResult,
  ValidateAdminRefreshTokenResult,
} from './auth.service';

export const loginAdmin = async (input: {
  email: string;
  password: string;
  device: DeviceType;
}): Promise<AdminLoginServiceResult> => {
  return authService.loginAdmin(input);
};

export const refreshAdminToken = async (
  refreshToken: string | undefined
): Promise<RefreshAdminTokenResult> => {
  return authService.refreshAdminToken(refreshToken);
};

export const logoutAdmin = async (
  refreshToken: string | undefined
): Promise<void> => {
  return authService.logoutAdmin(refreshToken);
};

export const getAdminMe = async (
  adminId: number
): Promise<AdminMeServiceResult> => {
  return authService.getAdminMe(adminId);
};
