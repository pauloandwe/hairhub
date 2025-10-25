import { getRedis } from '../auth-token.service'

export interface DraftStoreOptions<T> {
  keyPrefix: string
  empty: () => T
  ttlEnvVar?: string
  defaultTtlSec?: number
}

export interface DraftStore<T> {
  load(userId: string): Promise<T>
  save(userId: string, draft: T): Promise<void>
  clear(userId: string): Promise<void>
}

export function createDraftStore<T>(options: DraftStoreOptions<T>): DraftStore<T> {
  const memory: Record<string, T> = {}
  const ttlDefault = options.defaultTtlSec ?? 86400

  function keyFor(userId: string) {
    return `${options.keyPrefix}::${userId}`
  }

  async function load(userId: string): Promise<T> {
    const redis = await getRedis()
    if (!redis) return memory[userId] || options.empty()
    try {
      const raw = await redis.get(keyFor(userId))
      if (!raw) return options.empty()
      const parsed = JSON.parse(raw) as T
      return parsed || options.empty()
    } catch (err) {
      console.error(`[DraftStore:${options.keyPrefix}] failed to load:`, err)
      return options.empty()
    }
  }

  async function save(userId: string, draft: T): Promise<void> {
    const redis = await getRedis()
    const ttlEnv = options.ttlEnvVar ? process.env[options.ttlEnvVar] : undefined
    const ttl = ttlEnv ? parseInt(ttlEnv, 10) : ttlDefault
    if (!redis) {
      memory[userId] = draft
      return
    }
    try {
      await redis.set(keyFor(userId), JSON.stringify(draft), { EX: ttl })
    } catch (err) {
      console.error(`[DraftStore:${options.keyPrefix}] failed to save:`, err)
    }
  }

  async function clear(userId: string): Promise<void> {
    const redis = await getRedis()
    if (!redis) {
      delete memory[userId]
      return
    }
    try {
      await redis.del(keyFor(userId))
    } catch (err) {
      console.error(`[DraftStore:${options.keyPrefix}] failed to clear:`, err)
    }
  }

  return { load, save, clear }
}
