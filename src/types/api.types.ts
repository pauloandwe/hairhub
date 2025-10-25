export interface PaginationType {
  page: number
  pageSize: number
  totalElements?: number
  totalPages?: number
}

export interface APIResponseCreate<T> {
  data: {
    data?: T
    message: string
    statusCode: number
  }
  status: number
}

export interface APIResponseDelete<T> {
  data: {
    data?: T
    message: string
    statusCode: number
  }
  status: number
}

export interface APIResponseUpdate<T> {
  data: {
    data?: T
    message: string
    statusCode: number
  }
  status: number
}

export interface APIResponseRefund<T> {
  data: {
    data?: T
    message: string
    statusCode: number
  }
  status: number
}

export interface ValidateDTO {
  id: number
  isValid: boolean | null
}

export interface APIResponseGet<T> {
  data?: {
    data?: T
    message: string
    statusCode: number
  }
  status: number
}

export type APIResponseList<T> = {
  data?: APIResponsePagination<T>
  message: string
  reasons?: Array<Reason>
  statusCode: number
}

export type APIResponseListPagination<T> = {
  data: Array<T>
  pagination: PaginationType
}

export interface Reason {
  identifier?: string
  metadata?: {
    message?: string
  }
}

export interface APIErrorResponse {
  message: string
  key?: string
  metadata?: {
    message?: string
    reason?: Reason
  }
  reason?: Reason
  reasons?: Array<Reason>
  statusCode: number
}

export interface APIParams {
  search?: string
  filters?: string
  advancedFilters?: string
  includes?: string
  page?: number
  pageSize?: number
  orderBy?: string
  override?: boolean
}

export interface APIResponseListNoPagination<T> {
  data: {
    data?: Array<T>
    message: string
    statusCode: number
  }
  status: number
}

export interface APIResponsePaginationData<T> {
  data?: Array<T>
  page?: number
  pageSize?: number
  totalElements?: number
  totalPages?: number
  statusCode?: number
}

export interface APIResponsePagination<T> {
  data: APIResponsePaginationData<T>
}

export interface APIResponseCSV {
  statusCode: number
  message: string
  data: {
    data: string
  }
}

export interface APIResponsePDF {
  message: string
  statusCode: number
  data: {
    message?: string
    statusCode?: number
    data: string
  } & Blob
}

export interface APIResponseProcessingOp32 {
  message: string
  statusCode: number
  data: {
    data: {
      message: string
    }
  }
}

export interface APIResponseProcessingOp32ListFile {
  message: string
  statusCode: number
  data: Array<{
    time: Date
    path: string
    type: string
  }>
}
