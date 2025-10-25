export interface PendingListInteraction {
  type: string
  namespace: string
  validIds: Set<string>
  createdAt: number
  ttlMs: number
}

const DEFAULT_TTL_MS = 10 * 60 * 1000

const pendingByUser: Record<string, PendingListInteraction> = {}

export function buildNamespacedId(namespace: string, rawId: string) {
  return `${namespace}:${rawId}`
}

export function parseNamespacedId(id?: string): { namespace: string; value: string } | null {
  if (!id) return null
  const idx = id.indexOf(':')
  if (idx <= 0) return null
  const namespace = id.slice(0, idx)
  const value = id.slice(idx + 1)
  if (!namespace || !value) return null
  return { namespace, value }
}

interface RegisterParams {
  userId: string
  type: string
  namespace: string
  ids: string[]
  ttlMs?: number
}

export function registerPendingListInteraction({ userId, type, namespace, ids, ttlMs }: RegisterParams): void {
  pendingByUser[userId] = {
    type,
    namespace,
    validIds: new Set(ids.map(String)),
    createdAt: Date.now(),
    ttlMs: ttlMs ?? DEFAULT_TTL_MS,
  }
}

export type ConsumeRejectReason = 'none' | 'namespace' | 'value'
export interface ConsumeResultAccepted {
  accepted: true
  pending: PendingListInteraction
}
export interface ConsumeResultRejected {
  accepted: false
  reason: ConsumeRejectReason
}
export type ConsumeResult = ConsumeResultAccepted | ConsumeResultRejected

export function consumePendingListInteraction(userId: string, namespace: string, value: string): ConsumeResult {
  cleanupExpired(userId)
  const pending = pendingByUser[userId]
  if (!pending) return { accepted: false, reason: 'none' }
  if (pending.namespace !== namespace) return { accepted: false, reason: 'namespace' }
  if (!pending.validIds.has(value)) return { accepted: false, reason: 'value' }
  delete pendingByUser[userId]
  return { accepted: true, pending }
}

export function hasPendingInteraction(userId: string, namespace?: string): boolean {
  cleanupExpired(userId)
  const p = pendingByUser[userId]
  return !!p && (!namespace || p.namespace === namespace)
}

export type ListRow = { id: string; title: string; description?: string }
export type ListSection = { title: string; rows: ListRow[] }

export function buildListRows<T extends { id: string; name?: string }>(namespace: string, items: ReadonlyArray<T>, titleBuilder?: (item: T, index: number) => string, descriptionBuilder?: (item: T, index: number) => string | undefined): ListRow[] {
  return items.map((item, idx) => {
    const rawTitle = titleBuilder ? titleBuilder(item, idx) : `${idx + 1}. ${item.name ?? item.id}`
    const title = truncateListTitle(rawTitle, 24)

    const rawDescription = descriptionBuilder ? descriptionBuilder(item, idx) : undefined
    const description = typeof rawDescription === 'string' ? truncateListTitle(rawDescription, 72) : undefined

    return {
      id: buildNamespacedId(namespace, String(item.id)),
      title,
      description,
    }
  })
}

export const MORE_ACTION_TOKEN = '__MORE__'

export function buildMoreActionId(namespace: string, nextOffset: number) {
  return buildNamespacedId(namespace, `${MORE_ACTION_TOKEN}:${nextOffset}`)
}

export interface PaginatedRowsResult {
  rows: ListRow[]
  actionRows: ListRow[]
  nextOffset?: number
  visibleIds: string[]
}

export function buildPaginatedListRows<T extends { id: string; name?: string }>(namespace: string, items: ReadonlyArray<T>, offset = 0, limit = 10, titleBuilder?: (item: T, index: number) => string, descriptionBuilder?: (item: T, index: number) => string | undefined): PaginatedRowsResult {
  const remaining = Math.max(0, items.length - offset)
  const hasMore = remaining > limit
  const pageCount = hasMore ? Math.max(0, limit - 1) : Math.min(remaining, limit)
  const pageItems = items.slice(offset, offset + pageCount)

  const rows = buildListRows(namespace, pageItems, titleBuilder, descriptionBuilder)

  const actionRows: ListRow[] = []
  let nextOffset: number | undefined = undefined
  if (hasMore) {
    nextOffset = offset + pageCount
    actionRows.push({
      id: buildMoreActionId(namespace, nextOffset),
      title: 'Ver mais',
      description: 'Mostrar próximas opções',
    })
  }

  return {
    rows,
    actionRows,
    nextOffset,
    visibleIds: pageItems.map((i) => String(i.id)),
  }
}

function cleanupExpired(userId: string): void {
  const p = pendingByUser[userId]
  if (p && isExpired(p)) delete pendingByUser[userId]
}

function isExpired(p: PendingListInteraction): boolean {
  return Date.now() - p.createdAt > p.ttlMs
}

function truncateListTitle(value: string, max: number): string {
  if (!value || value.length <= max) return value
  if (max <= 1) return value.slice(0, max)
  return value.slice(0, max - 1).trimEnd() + '…'
}
