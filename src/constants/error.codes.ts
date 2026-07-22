export const ERROR_CODES = {
  SERVICE_TYPE_REQUIRED: {
    status: 400,
    message: '이용 서비스를 한 개 이상 선택해 주세요.',
  },
  INVALID_SERVICE_TYPE: {
    status: 400,
    message: '유효한 이용 서비스를 선택해 주세요.',
  },
  REGION_REQUIRED: {
    status: 400,
    message: '거주 지역을 선택해 주세요.',
  },
  INVALID_REGION: {
    status: 400,
    message: '유효한 거주 지역을 선택해 주세요.',
  },
  INVALID_IMAGE_FORMAT: {
    status: 400,
    message: '지원하지 않는 이미지 형식입니다.',
  },
  IMAGE_SIZE_EXCEEDED: {
    status: 413,
    message: '이미지 용량은 5MB 이하만 업로드할 수 있습니다.',
  },
  UNAUTHORIZED: {
    status: 401,
    message: '로그인이 필요합니다.',
  },
  USER_TYPE_FORBIDDEN: {
    status: 403,
    message: '접근 권한이 없습니다.',
  },
  FORBIDDEN: {
    status: 403,
    message: '해당 기능에 접근할 수 없습니다.',
  },
  PROFILE_ALREADY_EXISTS: {
    status: 409,
    message: '이미 등록된 프로필이 존재합니다.',
  },
  PROFILE_NOT_FOUND: {
    status: 404,
    message: '등록된 프로필을 찾을 수 없습니다.',
  },
  INVALID_FILTER_TYPE: {
    status: 400,
    message: '유효한 필터 조건을 선택해 주세요.',
  },
  INVALID_QUERY_PARAM: {
    status: 400,
    message: '유효하지 않은 정렬 또는 필터 값입니다.',
  },
  ALREADY_CONFIRMED_REQUEST: {
    status: 409,
    message: '이미 다른 견적으로 예약이 확정된 이사 요청입니다.',
  },
  QUOTE_NOT_FOUND: {
    status: 404,
    message: '존재하지 않거나 삭제된 견적서입니다.',
  },

  NO_CHANGE: {
    status: 400,
    message: '변경된 정보가 없습니다.',
  },
  INVALID_NAME: {
    status: 400,
    message: '이름은 2자 이상 20자 이하로 입력해 주세요.',
  },
  INVALID_EMAIL_FORMAT: {
    status: 400,
    message: '올바른 이메일 형식으로 입력해 주세요.',
  },
  EMAIL_ALREADY_EXISTS: {
    status: 409,
    message: '이미 사용 중인 이메일입니다.',
  },
  INVALID_PHONE_NUMBER_FORMAT: {
    status: 400,
    message: '전화번호는 숫자 11자리로 입력해 주세요.',
  },
  PHONE_NUMBER_ALREADY_EXISTS: {
    status: 409,
    message: '이미 사용 중인 전화번호입니다.',
  },
  CURRENT_PASSWORD_REQUIRED: {
    status: 400,
    message: '현재 비밀번호를 입력해 주세요.',
  },
  CURRENT_PASSWORD_MISMATCH: {
    status: 400,
    message: '현재 비밀번호가 일치하지 않습니다.',
  },
  NEW_PASSWORD_CONFIRM_REQUIRED: {
    status: 400,
    message: '새 비밀번호 확인을 입력해 주세요.',
  },
  INVALID_NEW_PASSWORD: {
    status: 400,
    message: '새 비밀번호는 8~20자의 영문, 숫자, 특수문자를 포함해야 합니다.',
  },
  NEW_PASSWORD_MISMATCH: {
    status: 400,
    message: '새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.',
  },
  SAME_AS_CURRENT_PASSWORD: {
    status: 400,
    message: '새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.',
  },
  MOVER_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 기사님입니다.',
  },
  ALREADY_FAVORITED: {
    status: 409,
    message: '이미 찜한 기사님입니다.',
  },
  FAVORITE_NOT_FOUND: {
    status: 404,
    message: '찜하지 않은 기사님입니다.',
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: '서버 내부 오류가 발생했습니다.',
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
