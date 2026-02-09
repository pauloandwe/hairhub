import { getRedis } from '../auth-token.service'
import { CacheKeys } from '../../helpers/Enums'

export enum OutreachType {
  SCHEDULING = 'scheduling',
  PROMOTION = 'promotion',
  BIRTHDAY = 'birthday',
  FEEDBACK = 'feedback',
}

export interface OutreachContext {
  type: OutreachType
  businessId: string
  businessPhone: string
  businessName: string
  clientName: string | null
  sentAt: string
  message: string
  metadata: Record<string, any>
}

const OUTREACH_TTL_SEC = 86400 // 24 hours

function keyFor(clientPhone: string): string {
  return `${CacheKeys.OUTREACH_CONTEXT}::${clientPhone}`
}

export async function setOutreachContext(clientPhone: string, context: OutreachContext): Promise<void> {
  const redis = await getRedis()
  if (!redis) return
  try {
    await redis.set(keyFor(clientPhone), JSON.stringify(context), { EX: OUTREACH_TTL_SEC })
  } catch (err) {
    console.error('[OutreachContext] failed to set:', err)
  }
}

export async function getOutreachContext(clientPhone: string): Promise<OutreachContext | null> {
  const redis = await getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get(keyFor(clientPhone))
    if (!raw) return null
    return JSON.parse(raw) as OutreachContext
  } catch (err) {
    console.error('[OutreachContext] failed to get:', err)
    return null
  }
}

export async function clearOutreachContext(clientPhone: string): Promise<void> {
  const redis = await getRedis()
  if (!redis) return
  try {
    await redis.del(keyFor(clientPhone))
  } catch (err) {
    console.error('[OutreachContext] failed to clear:', err)
  }
}

export async function hasActiveOutreach(clientPhone: string): Promise<boolean> {
  const redis = await getRedis()
  if (!redis) return false
  try {
    const exists = await redis.exists(keyFor(clientPhone))
    return exists === 1
  } catch (err) {
    console.error('[OutreachContext] failed to check exists:', err)
    return false
  }
}
