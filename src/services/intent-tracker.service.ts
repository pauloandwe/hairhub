import { getRedis } from './auth-token.service'
import { clearIntentHistory } from './intent-history.service'

const memoryLastIntents: Record<string, string> = {}

function buildKey(userId: string) {
  return `last_intent::${userId}`
}

export async function trackIntentChange(userId: string, newIntent: string): Promise<boolean> {
  const lastIntent = await getLastIntent(userId)

  if (lastIntent === newIntent) {
    return false
  }

  if (lastIntent) {
    await onIntentChange(userId, lastIntent, newIntent)
  }

  await saveLastIntent(userId, newIntent)
  return true
}

export async function getLastIntent(userId: string): Promise<string | null> {
  const redis = await getRedis()
  const key = buildKey(userId)

  if (!redis) {
    return memoryLastIntents[userId] || null
  }

  try {
    const raw = await redis.get(key)
    return raw || null
  } catch (err) {
    console.error('[IntentTracker] erro ao obter última intenção', err)
    return null
  }
}

async function saveLastIntent(userId: string, intentType: string): Promise<void> {
  const redis = await getRedis()
  const key = buildKey(userId)
  const ttl = 3600

  if (!redis) {
    memoryLastIntents[userId] = intentType
    return
  }

  try {
    await redis.set(key, intentType, { EX: ttl })
  } catch (err) {
    console.error('[IntentTracker] erro ao salvar última intenção', err)
  }
}

async function onIntentChange(userId: string, oldIntent: string, newIntent: string): Promise<void> {
  console.log(`[IntentTracker] Mudança de intenção detectada para ${userId}: ${oldIntent} → ${newIntent}`)

  await clearIntentHistory(userId, oldIntent)

  console.log(`[IntentTracker] Histórico da intenção "${oldIntent}" foi limpo`)
}

export async function clearIntentTracking(userId: string): Promise<void> {
  const redis = await getRedis()
  const key = buildKey(userId)

  if (!redis) {
    delete memoryLastIntents[userId]
    return
  }

  try {
    await redis.del(key)
  } catch (err) {
    console.error('[IntentTracker] erro ao limpar tracking', err)
  }
}
