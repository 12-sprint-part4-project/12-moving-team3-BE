import { ERROR_CODES, type ErrorCode } from '../constants/error.codes';

export class AppError extends Error {
  status: number;
  code: ErrorCode;

  // messageOverride: VALIDATION_ERROR 등에서 도메인별 구체 문구를 전달할 때 사용
  constructor(code: ErrorCode, messageOverride?: string) {
    const errorInfo = ERROR_CODES[code];

    super(messageOverride ?? errorInfo.message);

    this.status = errorInfo.status;
    this.code = code;
  }
}
