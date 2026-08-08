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
  INVALID_REQUEST: {
    status: 400,
    message: '요청 형식이 올바르지 않습니다.',
  },
  UNAUTHORIZED: {
    status: 401,
    message: '로그인이 필요한 기능입니다.',
  },
  ESTIMATE_REQUEST_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 견적 요청입니다.',
  },
  DESIGNATED_MOVER_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 지정 요청입니다.',
  },
  DESIGNATED_ALREADY_EXISTS: {
    status: 409,
    message: '이미 지정한 기사님입니다.',
  },
  QUOTE_ALREADY_RECEIVED_FROM_MOVER: {
    status: 409,
    message: '이미 견적을 받은 기사님입니다.',
  },
  ESTIMATE_REQUEST_NOT_SUBMITTED: {
    status: 409,
    message: '제출된 견적 요청에만 지정 견적을 보낼 수 있습니다.',
  },
  USER_TYPE_FORBIDDEN: {
    status: 403,
    message: '접근 권한이 없습니다.',
  },
  FORBIDDEN: {
    status: 403,
    message: '기사님은 찜 기능을 사용할 수 없습니다.',
  },
  VALIDATION_ERROR: {
    status: 400,
    message: '입력값이 올바르지 않습니다.',
  },
  ACTIVE_REQUEST_EXISTS: {
    status: 409,
    message: '이미 진행 중인 견적 요청이 있습니다.',
  },
  REQUEST_ALREADY_SUBMITTED: {
    status: 409,
    message: '이미 제출된 견적 요청은 수정할 수 없습니다.',
  },
  PROFILE_ALREADY_EXISTS: {
    status: 409,
    message: '이미 프로필 등록을 완료했습니다.',
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
    message: '유효하지 않은 요청 파라미터입니다.',
  },
  ALREADY_CONFIRMED_REQUEST: {
    status: 409,
    message: '이미 예약이 확정된 이사 요청입니다.',
  },
  QUOTE_NOT_FOUND: {
    status: 404,
    message: '존재하지 않거나 삭제된 견적서입니다.',
  },
  INVALID_REQUEST_BODY: {
    status: 400,
    message: '요청 본문 형식이 올바르지 않습니다.',
  },
  REQUEST_EXPIRED: {
    status: 409,
    message: '이사일이 지나 견적 요청이 만료되었습니다.',
  },
  REQUEST_CANCELED: {
    status: 409,
    message: '취소된 견적 요청입니다.',
  },
  REQUEST_CLOSED: {
    status: 409,
    message: '견적 제출 가능 인원이 마감되었습니다.',
  },
  NOT_DESIGNATED_TARGET: {
    status: 403,
    message: '지정 견적 대상 기사님이 아닙니다.',
  },
  QUOTE_ALREADY_SUBMITTED: {
    status: 409,
    message: '이미 견적을 제출한 요청입니다.',
  },
  ALREADY_REJECTED: {
    status: 409,
    message: '이미 반려한 견적 요청입니다.',
  },

  NO_CHANGE: {
    status: 400,
    message: '변경된 정보가 없습니다.',
  },
  NAME_REQUIRED: {
    status: 400,
    message: '이름을 입력해 주세요.',
  },
  INVALID_NAME: {
    status: 400,
    message: '이름은 2자 이상 20자 이하로 입력해 주세요.',
  },
  REQUIRED_FIELD_MISSING: {
    status: 400,
    message: '필수 입력값을 모두 입력해 주세요.',
  },
  INVALID_USER_TYPE: {
    status: 400,
    message: '지원하지 않는 사용자 유형입니다.',
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
  NICKNAME_ALREADY_EXISTS: {
    status: 409,
    message: '이미 사용 중인 닉네임입니다.',
  },
  INVALID_PASSWORD_FORMAT: {
    status: 400,
    message: '비밀번호 형식을 확인해 주세요.',
  },
  PASSWORD_CONFIRMATION_MISMATCH: {
    status: 400,
    message: '비밀번호가 일치하지 않습니다.',
  },
  LOGIN_REQUIRED_FIELD_MISSING: {
    status: 400,
    message: '이메일과 비밀번호를 모두 입력해 주세요.',
  },
  KAKAO_CODE_REQUIRED: {
    status: 400,
    message: '카카오 인가 코드가 필요합니다.',
  },
  KAKAO_CONFIG_MISSING: {
    status: 500,
    message: '카카오 로그인 설정이 올바르지 않습니다.',
  },
  KAKAO_TOKEN_EXCHANGE_FAILED: {
    status: 401,
    message: '카카오 인가 코드로 토큰을 발급받지 못했습니다.',
  },
  KAKAO_USER_INFO_FAILED: {
    status: 401,
    message: '카카오 사용자 정보를 조회하지 못했습니다.',
  },
  KAKAO_EMAIL_REQUIRED: {
    status: 400,
    message:
      '카카오 계정에 이메일이 필요합니다. 카카오에서 이메일 제공에 동의해 주세요.',
  },
  KAKAO_EMAIL_NOT_VERIFIED: {
    status: 400,
    message:
      '카카오에서 인증되지 않은 이메일은 사용할 수 없습니다. 카카오 계정에서 이메일을 인증해 주세요.',
  },
  INVALID_CREDENTIALS: {
    status: 401,
    message: '이메일 또는 비밀번호가 일치하지 않습니다.',
  },
  USER_TYPE_MISMATCH: {
    status: 403,
    message: '해당 사용자 유형으로 가입된 계정이 아닙니다.',
  },
  USER_SUSPENDED: {
    status: 403,
    message: '정지된 계정입니다. 해당 기능을 이용할 수 없습니다.',
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
  PROFILE_NOT_REGISTERED: {
    status: 404,
    message: '등록된 기사님 프로필이 없습니다. 프로필을 먼저 등록해 주세요.',
  },
  ALREADY_FAVORITED: {
    status: 409,
    message: '이미 찜한 기사님입니다.',
  },
  FAVORITE_NOT_FOUND: {
    status: 404,
    message: '찜하지 않은 기사님입니다.',
  },
  /** 고객이 본인 userId를 moverId로 찜 요청한 경우 */
  CANNOT_FAVORITE_SELF: {
    status: 403,
    message: '자기 자신은 찜할 수 없습니다.',
  },
  NOTIFICATION_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 알림입니다.',
  },
  REVIEW_ALREADY_EXISTS: {
    status: 409,
    message: '이미 작성한 리뷰가 있습니다.',
  },
  REVIEW_NOT_WRITABLE: {
    status: 409,
    message: '리뷰를 작성할 수 없는 견적입니다.',
  },
  REVIEW_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 리뷰입니다.',
  },
  REVIEW_FORBIDDEN: {
    status: 403,
    message: '본인 견적에만 리뷰를 작성할 수 있습니다.',
  },

  // 관리자
  ADMIN_INVALID_QUERY_PARAM: {
    status: 400,
    message: '조회 조건이 올바르지 않습니다.',
  },
  ADMIN_MEMBER_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 회원입니다.',
  },
  ADMIN_ESTIMATE_REQUEST_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 견적 요청입니다.',
  },
  ADMIN_CHAT_ROOM_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 채팅방입니다.',
  },
  ADMIN_REPORT_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 신고입니다.',
  },
  ADMIN_REPORT_ALREADY_PROCESSED: {
    status: 409,
    message: '이미 처리되었거나 반려된 신고입니다.',
  },
  ADMIN_REPORT_UNSUPPORTED_TARGET: {
    status: 400,
    message: '처리할 수 없는 신고 대상입니다.',
  },
  ADMIN_REPORT_INVALID_ACTIONS: {
    status: 400,
    message: '신고 대상에 허용되지 않는 처리 액션입니다.',
  },
  ADMIN_REPORT_TARGET_USER_NOT_FOUND: {
    status: 404,
    message: '신고 대상 사용자를 찾을 수 없습니다.',
  },
  ADMIN_REPORT_CONTENT_NOT_FOUND: {
    status: 404,
    message: '신고된 콘텐츠를 찾을 수 없습니다.',
  },
  ADMIN_REPORT_CONFLICT: {
    status: 409,
    message: '다른 관리자가 동시에 처리 중이거나 상태가 변경되었습니다.',
  },

  // 관리자 인증 전용 — 일반 유저/기사 인증 코드와 분리
  ADMIN_INVALID_LOGIN_BODY: {
    status: 400,
    message: '로그인 요청 형식이 올바르지 않습니다.',
  },
  ADMIN_INVALID_CREDENTIALS: {
    status: 401,
    // 이메일/비밀번호 중 무엇을 틀렸는지 노출하지 않기 위함
    message: '이메일 또는 비밀번호가 올바르지 않습니다.',
  },
  ADMIN_UNAUTHORIZED: {
    status: 401,
    message: '관리자 인증이 필요합니다.',
  },

  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: '서버 내부 오류가 발생했습니다.',
  },

  // 채팅
  ROOM_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 채팅방입니다.',
  },
  MESSAGE_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 메시지입니다.',
  },
  MESSAGING_NOT_ALLOWED: {
    status: 403,
    message: '이 채팅방에서는 메시지를 보낼 수 없습니다.',
  },
  ALREADY_LEFT: {
    status: 409,
    message: '이미 나간 채팅방입니다.',
  },

  // 커뮤니티
  POST_NOT_FOUND: {
    status: 404,
    message: '존재하지 않거나 삭제된 게시글입니다.',
  },
  POST_FORBIDDEN: {
    status: 403,
    message: '본인 게시글만 수정/삭제할 수 있습니다.',
  },
  POST_CATEGORY_NOT_MODIFIABLE: {
    status: 400,
    message: '카테고리는 수정할 수 없습니다.',
  },
  POST_TITLE_NOT_MODIFIABLE: {
    status: 400,
    message: '제목은 수정할 수 없습니다.',
  },
  POST_REGION_REQUIRED: {
    status: 400,
    message: '가구 나눔 게시글은 지역 선택이 필요합니다.',
  },
  POST_CONTENT_EMPTY: {
    status: 400,
    message: '게시글 내용을 입력해 주세요.',
  },
  POST_IMAGE_LIMIT_EXCEEDED: {
    status: 400,
    message: '이미지는 최대 5장까지 업로드할 수 있습니다.',
  },
  LIKE_ALREADY_EXISTS: {
    status: 409,
    message: '이미 좋아요한 게시글입니다.',
  },
  LIKE_NOT_FOUND: {
    status: 404,
    message: '좋아요 기록이 없습니다.',
  },
  COMMENT_NOT_FOUND: {
    status: 404,
    message: '존재하지 않는 댓글입니다.',
  },
  COMMENT_FORBIDDEN: {
    status: 403,
    message: '본인 댓글만 삭제할 수 있습니다.',
  },
  REPLY_DEPTH_EXCEEDED: {
    status: 400,
    message: '대댓글에는 답글을 달 수 없습니다.',
  },

  // 신고
  REPORT_ALREADY_EXISTS: {
    status: 409,
    message: '이미 신고한 대상입니다.',
  },
  REPORT_TARGET_NOT_FOUND: {
    status: 404,
    message: '신고 대상을 찾을 수 없습니다.',
  },
  REPORT_SELF_NOT_ALLOWED: {
    status: 403,
    message: '자기 자신 또는 본인 콘텐츠는 신고할 수 없습니다.',
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
