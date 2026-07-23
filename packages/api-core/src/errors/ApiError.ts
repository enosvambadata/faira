export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(code: string, message: string, httpStatus = 500, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
