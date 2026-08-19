import type { MoveType, NotificationType } from '@prisma/client';

/** 이사 유형 → 알림 문구용 한글 라벨 */
export const MOVE_TYPE_LABELS: Record<MoveType, string> = {
  SMALL: '소형이사',
  HOME: '가정이사',
  OFFICE: '사무실이사',
};

/**
 * 타입별 알림 템플릿.
 * `{변수}` 는 payload 키로 치환해 content 스냅샷을 만든다.
 * FE 강조: type별 템플릿에서 payload 구간만 파란 span으로 렌더.
 *
 * 표시 이름 규칙:
 * - 이사(견적)·채팅방 오픈(GENERAL/DESIGNATED) → User.name (`customerName` / `moverName` / `counterpartName`)
 * - 채팅방 오픈(COMMUNITY) → User.nickname (payload 키는 동일 `counterpartName`)
 * - 커뮤니티·리뷰 → User.nickname (`*Nickname`)
 * 채팅 partner.displayName도 동일 규칙 (`resolveChatCounterpartDisplayName`, #299)
 */
export const NOTIFICATION_TEMPLATES: Record<NotificationType, string> = {
  NEW_QUOTE_REQUEST_ARRIVED:
    '{customerName} 고객님의 {moveTypeLabel} 견적 요청이 도착했어요',
  NEW_DESIGNATED_QUOTE_REQUEST_ARRIVED:
    '{customerName} 고객님의 {moveTypeLabel} 지정 견적 요청이 도착했어요',
  // 강조: `{moveTypeLabel} 견적`
  NEW_QUOTE_OFFER_ARRIVED:
    '{moverName} 기사님의 {moveTypeLabel} 견적이 도착했어요',
  NEW_DESIGNATED_QUOTE_OFFER_ARRIVED:
    '{moverName} 기사님의 {moveTypeLabel} 지정 견적이 도착했어요',
  // 강조: `확정` (고정 문구). 고객 수신 기본 템플릿 — 기사 수신은 QUOTE_CONFIRMED_FOR_MOVER
  QUOTE_CONFIRMED: '{moverName} 기사님의 견적이 확정되었어요',
  DESIGNATED_QUOTE_REJECTED: '{moverName} 기사님이 지정 견적 요청을 반려했어요',
  // 강조: `{departureRegion} → {arrivalRegion} 이사 예정일`
  CUSTOMER_MOVE_DAY_REMINDER:
    '내일은 {departureRegion} → {arrivalRegion} 이사 예정일이에요.',
  MOVER_MOVE_DAY_REMINDER:
    '내일은 {departureRegion} → {arrivalRegion} 이사 예정일이에요.',
  REVIEW_REQUESTED: '{moveTypeLabel} 이용 후기를 남겨주세요',
  REVIEW_WRITTEN: '{customerNickname}님이 리뷰를 남겼어요',
  COMMUNITY_COMMENT: '{authorNickname}님이 댓글을 남겼어요',
  // 답글은 원글 댓글과 type을 분리해 FE 딥링크·문구를 다르게 쓴다
  COMMUNITY_REPLY: '{authorNickname}님이 답글을 남겼어요',
  POST_REMOVED_BY_REPORT: '신고로 게시글이 삭제되었어요',
  CHAT_ROOM_OPENED: '{counterpartName}님과의 채팅방이 열렸어요',
  SANCTION_NOTIFIED: '계정에 제재가 적용되었습니다',
};

/** 견적 확정 — 기사 수신용 (고객 수신은 NOTIFICATION_TEMPLATES.QUOTE_CONFIRMED 유지) */
export const QUOTE_CONFIRMED_FOR_MOVER =
  '{customerName} 고객님의 견적이 확정되었어요';

/** payload 키-값으로 템플릿의 {key} 를 치환. templateOverride 시 type 기본 템플릿 대신 사용 */
export const renderNotificationContent = (
  type: NotificationType,
  payload: Record<string, string>,
  templateOverride?: string
): string => {
  const template = templateOverride ?? NOTIFICATION_TEMPLATES[type];

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return payload[key] ?? '';
  });
};

export const toMoveTypeLabel = (
  moveType: MoveType | null | undefined
): string => {
  if (!moveType) {
    return '이사';
  }

  return MOVE_TYPE_LABELS[moveType];
};

/**
 * 피그마 경로 표기: 경기(일산) — 주소 앞 토큰을 시(구)로 압축
 */
export const toRouteRegionLabel = (
  address: string | null | undefined
): string => {
  if (!address?.trim()) {
    return '미정';
  }

  const tokens = address.trim().split(/\s+/).filter(Boolean);
  const sidoRaw = tokens[0] ?? '';
  // 특별자치도를 도보다 먼저 제거해야 전북특별자치도 → 전북 이 된다
  const sido = sidoRaw
    .replace(/특별자치시$/, '')
    .replace(/특별자치도$/, '')
    .replace(/특별시$/, '')
    .replace(/광역시$/, '')
    .replace(/도$/, '');

  if (tokens.length < 2) {
    return sido || '미정';
  }

  // "고양시 일산동구"처럼 시 다음 구가 있으면 구를 우선
  let districtToken = tokens[1];
  if (/시$/.test(tokens[1]) && tokens[2]) {
    districtToken = tokens[2];
  }

  const district = districtToken.replace(/(시|군|구)$/, '');
  return `${sido}(${district})`;
};
