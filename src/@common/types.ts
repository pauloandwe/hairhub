export interface Pagination {
  page?: number
  pageSize?: number
}

export interface Sort {
  field?: string
  direction?: 'asc' | 'desc'
}
