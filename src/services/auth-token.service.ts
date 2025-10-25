import { sendWhatsAppMessage } from '../api/meta.api'
import { setUserContext } from '../env.config'

// Redis connection (optional, fallback to memory)
let redisClient: any = null

export async function getRedis(): Promise<any> {
  if (redisClient) return redisClient

  try {
    const redis = await import('redis')
    const redisUrl = process.env.REDIS_URL
    if (redisUrl) {
      redisClient = redis.createClient({ url: redisUrl })
      await redisClient.connect()
      console.log('✅ Redis connected')
    }
  } catch (error) {
    console.log('⚠️  Redis not available, using memory storage')
  }

  return redisClient
}

export async function ensureUserApiToken(phone: string): Promise<{ proceed: boolean }> {
  // Simplified - no longer using external user service
  // For BarberHub, we don't need user authentication via external API
  return { proceed: true }
}
