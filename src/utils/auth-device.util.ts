import { DeviceType } from '@prisma/client';
import { UAParser } from 'ua-parser-js';

/**
 * UA 위조·누락이 가능하므로 보안 판정이 아니라 세션 메타데이터용이다.
 */
export const resolveAuthDeviceType = (
  userAgent: string | undefined
): DeviceType => {
  if (!userAgent?.trim()) {
    return DeviceType.DESKTOP;
  }

  const { device } = UAParser(userAgent);

  if (device.type === 'mobile') {
    return DeviceType.MOBILE;
  }

  if (device.type === 'tablet') {
    return DeviceType.TABLET;
  }

  return DeviceType.DESKTOP;
};
