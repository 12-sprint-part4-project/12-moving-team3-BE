/** S3 key를 공개 프로필 이미지 URL로 변환한다. CDN 설정이 없으면 null을 반환한다. */
export const toProfileImageUrl = (
  profileImageKey: string | null | undefined
): string | null => {
  if (!profileImageKey) {
    return null;
  }

  const baseUrl =
    process.env.CDN_BASE_URL?.trim() ||
    process.env.S3_PUBLIC_BASE_URL?.trim() ||
    null;

  if (!baseUrl) {
    return null;
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedKey = profileImageKey.replace(/^\//, '');

  return `${normalizedBase}/${normalizedKey}`;
};
