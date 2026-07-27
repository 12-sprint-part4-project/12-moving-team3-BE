import { Region } from '@prisma/client';

/**
 * Region Enum -> 화면에 노출할 한글 라벨
 */
const REGION_LABELS: Record<Region, string> = {
  SEOUL: '서울',
  GYEONGGI: '경기',
  INCHEON: '인천',
  GANGWON: '강원',
  CHUNGBUK: '충북',
  CHUNGNAM: '충남',
  SEJONG: '세종',
  DAEJEON: '대전',
  JEONBUK: '전북',
  GWANGJU_JEONNAM: '광주/전남',
  GYEONGBUK: '경북',
  DAEGU: '대구',
  ULSAN: '울산',
  GYEONGNAM: '경남',
  BUSAN: '부산',
  JEJU: '제주',
};

/**
 * Region Enum -> 실제 주소 문자열의 앞부분(시/도)에 등장할 수 있는 키워드 목록
 * (departureAddress/arrivalAddress 는 자유 형식 주소 문자열이라 매칭용 키워드를 별도로 관리)
 */
const REGION_ADDRESS_KEYWORDS: Record<Region, string[]> = {
  SEOUL: ['서울'],
  GYEONGGI: ['경기'],
  INCHEON: ['인천'],
  GANGWON: ['강원'],
  CHUNGBUK: ['충북', '충청북도'],
  CHUNGNAM: ['충남', '충청남도'],
  SEJONG: ['세종'],
  DAEJEON: ['대전'],
  JEONBUK: ['전북', '전라북도'],
  GWANGJU_JEONNAM: ['광주', '전남', '전라남도'],
  GYEONGBUK: ['경북', '경상북도'],
  DAEGU: ['대구'],
  ULSAN: ['울산'],
  GYEONGNAM: ['경남', '경상남도'],
  BUSAN: ['부산'],
  JEJU: ['제주'],
};

/**
 * 주소에서 시/도 추론에 사용할 앞 단어(첫 공백 이전 토큰)를 추출
 * 예: "부산시 해운대구" -> "부산시"
 */
const getAddressPrefix = (address: string): string => {
  const trimmed = address.trim();
  if (!trimmed) return '';

  const [firstToken = ''] = trimmed.split(/\s+/);
  return firstToken;
};

/**
 * Region Enum 값을 화면 표시용 한글 라벨로 변환
 */
const getRegionLabel = (region: Region): string => REGION_LABELS[region];

/**
 * Region Enum 값에 대응하는 주소 매칭 키워드 목록
 * 서비스 지역 필터에서는 주소 전체 contains 대신 startsWith 매칭에 사용
 */
export const getRegionAddressKeywords = (region: Region): string[] =>
  REGION_ADDRESS_KEYWORDS[region];

/**
 * 주소 앞 단어가 해당 Region 키워드로 시작하는지 여부
 */
const isAddressInRegion = (
  address: string | null | undefined,
  region: Region
): boolean => {
  if (!address) return false;

  const prefix = getAddressPrefix(address);
  if (!prefix) return false;

  return REGION_ADDRESS_KEYWORDS[region].some((keyword) =>
    prefix.startsWith(keyword)
  );
};

/**
 * 주소 앞 단어로부터 매칭되는 Region 을 추론
 */
const inferRegionFromAddress = (
  address: string | null | undefined
): Region | null => {
  if (!address) return null;

  const matched = Object.values(Region).find((region) =>
    isAddressInRegion(address, region)
  );

  return matched ?? null;
};

/**
 * 주소 문자열로부터 매칭되는 한글 라벨을 추론
 */
export const inferRegionLabelFromAddress = (
  address: string | null | undefined
): string | null => {
  const region = inferRegionFromAddress(address);
  return region ? getRegionLabel(region) : null;
};
