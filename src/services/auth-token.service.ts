import { createClient } from 'redis'
import { usersService } from './users/users.service'
import { env, setUserContext } from '../env.config'
import { setApiBearerToken } from '../config/api.config'
import { systemLogger } from '../utils/pino'
import { unwrapApiResponse } from '../utils/http'

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
  assistantContext?: string | null
  phoneNumberId?: string | null
  clientName?: string | null
  clientNickname?: string | null
  clientBirthDate?: string | null
  clientServicePreferences?: string | null
  clientRestrictions?: string | null
  clientAiContext?: string | null
  [key: string]: any
}

export async function ensureUserApiToken(businessPhone: string, phone: string): Promise<CachedUserTokenData | null> {
  try {
    const responseBusiness = await usersService.getBusinessByPhone(businessPhone, phone)
    const payload = unwrapApiResponse<any>(responseBusiness)
    if (!payload) return null

    const { workingHours, professionals, ...sanitizedData } = payload
    const token = sanitizedData?.token as string | undefined
    if (token) setApiBearerToken(token)

    const clientName = sanitizedData?.clientName || null
    const clientNickname = sanitizedData?.clientNickname || null
    const clientBirthDate = sanitizedData?.clientBirthDate || null
    const clientServicePreferences = sanitizedData?.clientServicePreferences || null
    const clientRestrictions = sanitizedData?.clientRestrictions || null
    const clientAiContext = sanitizedData?.clientAiContext || null
    const assistantContext = sanitizedData?.assistantContext || null
    const phoneNumberId = sanitizedData?.phoneNumberId || null
    const businessTimezone = sanitizedData?.timezone || null

    console.log('[AuthToken] Token encontrado para businessPhone:', {
      id: sanitizedData?.id,
      name: sanitizedData?.name,
      phone: sanitizedData?.phone,
      phoneNumberId,
      type: sanitizedData?.type,
      assistantContext,
      clientName,
      clientNickname,
      clientBirthDate,
    })
    await setUserContext(phone, {
      token,
      ...sanitizedData,
      businessId: sanitizedData.id,
      businessPhone: sanitizedData.phone,
      businessTimezone,
      phoneNumberId,
      businessName: sanitizedData.name,
      businessType: sanitizedData.type,
      assistantContext,
      clientName,
      clientNickname,
      clientBirthDate,
      clientServicePreferences,
      clientRestrictions,
      clientAiContext,
    })

    systemLogger.info(
      {
        context: 'System',
        phone,
        businessPhone,
        token: sanitizedData?.token,
        phoneNumberId,
        businessTimezone,
        assistantContext,
        clientName,
        clientNickname,
        clientBirthDate,
        clientServicePreferences,
        clientRestrictions,
        clientAiContext,
        payload: sanitizedData,
      },
      'User authenticated successfully with token.',
    )

    return {
      ...sanitizedData,
      businessTimezone,
      phoneNumberId,
      assistantContext,
      clientName,
      clientNickname,
      clientBirthDate,
      clientServicePreferences,
      clientRestrictions,
      clientAiContext,
    } as CachedUserTokenData
  } catch (remoteErr) {
    console.error('[AuthToken] Erro ao buscar token remoto:', remoteErr)
    throw remoteErr
  }
}
