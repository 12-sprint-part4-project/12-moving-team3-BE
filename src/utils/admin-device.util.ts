import { DeviceType } from '@prisma/client';
import { UAParser } from 'ua-parser-js';

/**
 * UA 위조·누락이 가능하므로 보안 판정이 아니라 세션 메타데이터용이다.
 */
export const resolveAdminDeviceType = (
  userAgent: string | undefined
): DeviceType => {
  if (!userAgent?.trim()) {
    // UA가 없는 API 클라이언트·프록시 요청은 데스크톱으로 간주
    return DeviceType.DESKTOP;
  }

  const { device } = UAParser(userAgent);

  if (device.type === 'mobile') {
    return DeviceType.MOBILE;
  }

  if (device.type === 'tablet') {
    return DeviceType.TABLET;
  }

  // desktop은 type이 비어 있는 경우가 많아 그 외 값도 DESKTOP으로 폴백
  return DeviceType.DESKTOP;
};
