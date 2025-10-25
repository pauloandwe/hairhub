export interface IBaseEntity {
  id: string | number
  createdAt: string
}

export interface SelectionItem {
  id: string
  name: string
}

export interface SummarySections {
  label: string
  value: (value: any) => any
}
export type FieldKind = 'number' | 'string' | 'ref' | 'custom'

export type DraftStatus = 'collecting' | 'awaiting_confirmation' | 'confirmed' | 'completed'
