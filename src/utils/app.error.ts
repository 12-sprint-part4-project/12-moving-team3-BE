import { ERROR_CODES, type ErrorCode } from '../constants/error.codes';

export class AppError extends Error {
  status: number;
  code: ErrorCode;

  constructor(code: ErrorCode) {
    const errorInfo = ERROR_CODES[code];

    super(errorInfo.message);

    this.status = errorInfo.status;
    this.code = code;
  }
}
