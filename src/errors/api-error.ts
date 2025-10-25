import axios, { AxiosError } from 'axios'
import { ApiErrorTranslations } from '../enums/apiErrors.enums'

export interface ApiErrorResponse {
  statusCode?: number
  message?: string
  key?: string
  reason?: {
    identifier?: string
    metadata?: Record<string, any> & { message?: string }
    key?: string
  }
  reasons?: Array<{
    identifier?: string
    metadata?: Record<string, any> & { message?: string }
    key?: string
  }>
  [k: string]: any
}

export class ApiError extends Error {
  statusCode?: number
  key?: string
  identifier?: string
  userMessage: string
  raw: unknown

  constructor(opts: { statusCode?: number; key?: string; identifier?: string; message?: string; userMessage: string; raw?: unknown }) {
    super(opts.message || opts.userMessage || 'Erro de API')
    this.name = 'ApiError'
    this.statusCode = opts.statusCode
    this.key = opts.key
    this.identifier = opts.identifier
    this.userMessage = opts.userMessage
    this.raw = opts.raw
  }
}

function fallbackMessage(data: ApiErrorResponse): string {
  return data?.reason?.metadata?.message || data?.message || ApiErrorTranslations.UNKNOWN
}

export function extractErrorKey(data: ApiErrorResponse): string | undefined {
  return data?.key || data?.reason?.key || data?.reasons?.[0]?.key
}

export function getUserMessageForErrorKey(key: string | undefined, data: ApiErrorResponse): string {
  const k = key as keyof typeof ApiErrorTranslations
  if (key && ApiErrorTranslations[k]) return ApiErrorTranslations[k]
  return fallbackMessage(data)
}

export function normalizeAxiosError(error: { message?: string }): ApiError {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<ApiErrorResponse>
    const data: ApiErrorResponse = ax.response?.data || {}
    const key = extractErrorKey(data)
    const identifier = data?.reason?.identifier || data?.reasons?.[0]?.identifier
    const statusCode = data?.statusCode || ax.response?.status
    const userMessage = getUserMessageForErrorKey(key, data)

    return new ApiError({
      statusCode,
      key,
      identifier,
      message: typeof data?.message === 'string' ? data.message : undefined,
      userMessage,
      raw: error,
    })
  }

  return new ApiError({
    message: error?.message || 'Erro desconhecido',
    userMessage: error?.message || 'Ocorreu um erro.',
    raw: error,
  })
}
