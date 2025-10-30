export type FarmSelectionErrorCode = 'MISSING_INSTITUTION' | 'LIST_REQUEST_FAILED'

export class FarmSelectionError extends Error {
  readonly code: FarmSelectionErrorCode
  readonly cause?: unknown

  constructor(code: FarmSelectionErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'FarmSelectionError'
    this.code = code
    this.cause = cause
  }
}
