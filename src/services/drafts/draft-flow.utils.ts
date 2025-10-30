export type FieldKind = 'number' | 'string' | 'ref' | 'custom'

export interface MissingRule<T, K extends keyof T = keyof T> {
  key: K
  kind: FieldKind
  validate?: (value: T[K], draft: T) => boolean
}

export function computeMissing<T, K extends keyof T>(draft: T, rules: MissingRule<T, K>[]): K[] {
  const missing: K[] = []
  for (const r of rules) {
    const value = draft[r.key]
    let ok = true
    switch (r.kind) {
      case 'number':
        ok = typeof value === 'number' && Number.isFinite(value) && value > 0
        break
      case 'string':
        ok = typeof value === 'string' && value.trim().length > 0
        break
      case 'ref': {
        const v = value as { id?: unknown } | null | undefined
        ok = Boolean(v && v.id)
        break
      }
      case 'custom':
        ok = r.validate ? Boolean(r.validate(value, draft)) : true
        break
    }
    if (!ok) missing.push(r.key)
  }
  return missing
}

export interface SummarySection<T> {
  label: string
  value: (draft: T) => string | null | undefined
}

export function buildSummary<T>(title: string, draft: T, sections: SummarySection<T>[]): string {
  const lines: string[] = []
  if (title) lines.push(title)

  for (const section of sections) {
    const value = section.value(draft)
    lines.push(`- ${section.label}: ${value ?? '(não informado)'}`)
  }
  return lines.join('\n')
}

function isNotNil<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined
}

export function tryBuildPayload<T, P extends Record<string, unknown>>(draft: T, map: { [K in keyof P]: (d: T) => P[K] | null | undefined }): P | null {
  const out: Partial<P> = {}
  for (const key of Object.keys(map) as (keyof P)[]) {
    const val = map[key](draft)
    if (!isNotNil(val)) return null
    out[key] = val
  }
  return out as P
}
