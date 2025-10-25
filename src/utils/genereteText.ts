type Primitive = string | number | boolean | null

type OpSpec = { op: 'LIKE'; value: Primitive } | { op: 'EQ'; value: Primitive } | { op: 'IN'; value: Primitive[] } | { op: 'BETWEEN'; value: [Primitive, Primitive] }

type FilterValue = Primitive | Primitive[] | OpSpec

export function generateFilterText(args: Record<string, FilterValue>): string {
  const escapeVal = (v: Primitive) => String(v).replace(/([;,:\\])/g, '\\$1')

  const parts: string[] = []

  for (const [key, raw] of Object.entries(args)) {
    if (raw === undefined) continue

    let op: 'LIKE' | 'EQ' | 'IN' | 'BETWEEN'
    let payload: Primitive | Primitive[]

    if (Array.isArray(raw)) {
      op = raw.length === 2 ? 'BETWEEN' : 'IN'
      payload = raw as Primitive[]
    } else if (raw && typeof raw === 'object' && 'op' in (raw as any)) {
      const spec = raw as OpSpec
      op = spec.op
      payload = spec.value as any
    } else {
      op = 'LIKE'
      payload = raw as Primitive
    }

    let valueStr: string
    if (op === 'BETWEEN') {
      const [a, b] = payload as [Primitive, Primitive]
      valueStr = `${escapeVal(a)},${escapeVal(b)}`
    } else if (op === 'IN') {
      valueStr = (payload as Primitive[]).map(escapeVal).join(',')
    } else {
      valueStr = escapeVal(payload as Primitive)
    }

    parts.push(`${key}:${op}:${valueStr}`)
  }

  return parts.join(';')
}
