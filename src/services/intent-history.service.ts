import OpenAI from 'openai'
import { getRedis } from './auth-token.service'
import { env, getUserContext, getUserContextSync } from '../env.config'

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

const memoryHistories: Record<string, Record<string, ChatMessage[]>> = {}

function buildKey(userId: string, intentType: string) {
  return `intent_history::${userId}::${intentType}`
}

export async function getIntentHistory(userId: string, intentType: string): Promise<ChatMessage[]> {
  const redis = await getRedis()
  const key = buildKey(userId, intentType)

  if (!redis) {
    if (!memoryHistories[userId]) memoryHistories[userId] = {}
    return memoryHistories[userId][intentType] || []
  }

  try {
    const raw = await redis.get(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('[IntentHistory] erro ao obter histórico', err)
    return []
  }
}

export async function saveIntentHistory(userId: string, intentType: string, history: ChatMessage[]) {
  const redis = await getRedis()
  const ttl = parseInt(env.REDIS_INTENT_HISTORY_TTL_SEC, 10)
  const maxMessages = 20
  const trimmed = history.slice(-maxMessages)
  const key = buildKey(userId, intentType)

  if (!redis) {
    if (!memoryHistories[userId]) memoryHistories[userId] = {}
    memoryHistories[userId][intentType] = trimmed
    return
  }

  try {
    await redis.set(key, JSON.stringify(trimmed), { EX: ttl })
  } catch (err) {
    console.error('[IntentHistory] erro ao salvar histórico', err)
  }
}

export async function appendIntentHistory(userId: string, intentType: string, messages: ChatMessage[]) {
  const current = await getIntentHistory(userId, intentType)
  current.push(...messages)
  await saveIntentHistory(userId, intentType, current)
}

export async function clearIntentHistory(userId: string, intentType: string): Promise<void> {
  const redis = await getRedis()
  const key = buildKey(userId, intentType)

  if (!redis) {
    if (memoryHistories[userId]) delete memoryHistories[userId][intentType]
    return
  }

  try {
    await redis.del(key)
  } catch (err) {
    console.error('[IntentHistory] erro ao limpar histórico', err)
  }
}

export async function clearAllUserIntents(userId: string): Promise<void> {
  const redis = await getRedis()

  if (!redis) {
    delete memoryHistories[userId]
    return
  }

  try {
    const pattern = `intent_history::${userId}::*`
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      for (const key of keys) {
        await redis.del(key)
      }
    }
  } catch (err) {
    console.error('[IntentHistory] erro ao limpar todos os históricos', err)
  }
}

export function getCurrentIntent(userId: string): string {
  const context = getUserContextSync(userId)
  return context?.activeRegistration?.type || 'default'
}
