import { getRedis } from './auth-token.service'
import { CacheKeys } from '../helpers/Enums'
import { UserRuntimeContext } from '../env.config'

export interface UserContextStoreOptions {
  ttlEnvVar?: string
  defaultTtlSec?: number
}

export interface UserContextStore {
  load(userId: string): Promise<UserRuntimeContext | undefined>
  save(userId: string, context: UserRuntimeContext): Promise<void>
  clear(userId: string): Promise<void>
}

export function createUserContextStore(options: UserContextStoreOptions = {}): UserContextStore {
  const memory: Record<string, UserRuntimeContext> = {}
  const ttlDefault = options.defaultTtlSec ?? 3600

  function keyFor(userId: string) {
    return `${CacheKeys.USER_CONTEXT}::${userId}`
  }

  async function load(userId: string): Promise<UserRuntimeContext | undefined> {
    const redis = await getRedis()
    if (!redis) {
      return memory[userId]
    }
    try {
      const raw = await redis.get(keyFor(userId))
      if (!raw) return undefined
      const parsed = JSON.parse(raw) as UserRuntimeContext
      return parsed
    } catch (err) {
      console.error(`[UserContextStore] failed to load:`, err)
      return undefined
    }
  }

  async function save(userId: string, context: UserRuntimeContext): Promise<void> {
    const redis = await getRedis()
    const ttlEnv = options.ttlEnvVar ? process.env[options.ttlEnvVar] : undefined
    const ttl = ttlEnv ? parseInt(ttlEnv, 10) : ttlDefault

    if (!redis) {
      memory[userId] = context
      return
    }

    try {
      await redis.set(keyFor(userId), JSON.stringify(context), { EX: ttl })
    } catch (err) {
      console.error(`[UserContextStore] failed to save:`, err)
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
      console.error(`[UserContextStore] failed to clear:`, err)
    }
  }

  return { load, save, clear }
}
