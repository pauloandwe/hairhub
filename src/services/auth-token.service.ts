import { createClient } from 'redis'
import { usersService } from './users/users.service'
import { env, setUserContext } from '../env.config'
import { setApiBearerToken } from '../config/api.config'
import { systemLogger } from '../utils/pino'

let redisClient: ReturnType<typeof createClient> | null = null

export async function getRedis(): Promise<ReturnType<typeof createClient> | null> {
  if (redisClient) return redisClient

  if (env.REDIS_HOST) {
    const port = env.REDIS_PORT ? parseInt(env.REDIS_PORT, 10) : 6379
    const password = env.REDIS_PASSWORD || ''
    redisClient = createClient({
      socket: { host: env.REDIS_HOST, port },
      password,
    })
  } else {
    return null
  }
  redisClient.on('error', (err: unknown) => console.error('[Redis] error', err))
  await redisClient.connect()
  return redisClient
}

interface CachedUserTokenData {
  token: string
  farmId?: string
  farmName?: string
  userName?: string
  [key: string]: any
}

export async function ensureUserApiToken(businessId: string, phone: string): Promise<CachedUserTokenData | null> {
  try {
    const responseBusiness = await usersService.getBusiness(businessId, phone)
    const data = responseBusiness?.data?.data
    const token = data?.token as string | undefined
    if (token) setApiBearerToken(token)

    await setUserContext(phone, {
      token,
      ...data,
      businessId: data.id,
      businessName: data.name,
      businessType: data.type,
    })

    systemLogger.info(
      {
        context: 'System',
        phone,
        businessId,
        token: data?.token,
        payload: data,
      },
      'User authenticated successfully with token.',
    )

    if (data) return data as CachedUserTokenData

    return null
  } catch (remoteErr) {
    console.error('[AuthToken] Erro ao buscar token remoto:', remoteErr)
    throw remoteErr
  }
}
