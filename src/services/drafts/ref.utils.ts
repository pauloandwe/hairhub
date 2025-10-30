import { IdNameRef, PartialIdNameRef } from './types'

export function normalizeText(value?: string | null): string {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function mergeIdNameRef(dst: IdNameRef, name?: string | PartialIdNameRef): void {
  if (!name) return
  if (typeof name === 'string') {
    if (name !== undefined) dst.name = name ?? null
  }
  if (typeof name === 'object') {
    if (name?.id !== undefined) dst.id = name.id ?? null
    if (name?.name !== undefined) dst.name = name.name ?? null
  }
}

export function findMatchByIdOrName<T extends { id?: string; name?: string }>(items: T[], needle: PartialIdNameRef, opts?: { getId?: (item: T) => string; getName?: (item: T) => string }): T | undefined {
  if (!items || !items.length || !needle) return undefined

  const idN = normalizeText(needle.id ?? '')
  const nameN = normalizeText(needle.name ?? '')
  if (!idN && !nameN) return undefined

  const getId: (item: T) => string = opts?.getId ?? ((i: T) => String(i.id ?? ''))
  const getName: (item: T) => string = opts?.getName ?? ((i: T) => String(i.name ?? ''))

  return items.find((it) => {
    const itemIdN = normalizeText(getId(it))
    const itemNameN = normalizeText(getName(it))
    return (idN && itemIdN === idN) || (nameN && itemNameN === nameN)
  })
}

export function findNestedMatchByIdOrName<P, C extends { id?: string; name?: string }>(
  parents: P[],
  getChildren: (parent: P) => C[],
  needle: PartialIdNameRef,
  opts?: {
    getChildId?: (child: C) => string
    getChildName?: (child: C) => string
  },
): { parent: P; child: C } | undefined {
  if (!parents || !parents.length || !needle) return undefined

  const idN = normalizeText(needle.id ?? '')
  const nameN = normalizeText(needle.name ?? '')
  if (!idN && !nameN) return undefined

  const getChildId: (child: C) => string = opts?.getChildId ?? ((i: C) => String(i.id ?? ''))
  const getChildName: (child: C) => string = opts?.getChildName ?? ((i: C) => String(i.name ?? ''))

  for (const parent of parents) {
    const children = getChildren(parent)
    for (const child of children) {
      const cid = normalizeText(getChildId(child))
      const cname = normalizeText(getChildName(child))
      if ((idN && cid === idN) || (nameN && cname === nameN)) {
        return { parent, child }
      }
    }
  }
  return undefined
}
