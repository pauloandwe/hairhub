import api from '../../config/api.config'
import { getFarmIdForPhone } from '../../env.config'
import { DeathCreationPayload, DeathRecord } from './death-draft.service'
import { APIResponseCreate } from '../../types/api.types'

const memoryDb: DeathRecord[] = []

export class DeathService {
  private servicePrefix = process.env.LIVESTOCKS_URL

  async validate(phone: string, data: object): Promise<any> {
    const farmId = getFarmIdForPhone(phone)

    const payload = {
      data: {
        ...data,
      },
    }

    return api.post(this.servicePrefix + `/${farmId}/deaths/validate`, payload)
  }

  async create(phone: string, payload: DeathCreationPayload, endpoint = '/deaths'): Promise<{ id: string }> {
    const farmId = getFarmIdForPhone(phone)

    try {
      const url = `${this.servicePrefix}/${farmId}${endpoint}`
      const response = (await api.post(url, { data: { ...payload, farmId } })) as APIResponseCreate<DeathRecord>

      const createdRecord = response?.data?.data
      const resolvedId = createdRecord?.id

      if (!resolvedId) {
        console.error('[DeathService] Create response is missing an identifier:', response?.data)
        throw new Error('Não foi possível identificar o registro criado.')
      }

      const newRecord: DeathRecord = {
        ...payload,
        ...createdRecord,
        id: String(resolvedId),
        createdAt: createdRecord?.createdAt ?? new Date().toISOString(),
      }

      memoryDb.push(newRecord)

      return { id: String(resolvedId) }
    } catch (error) {
      console.error('[DeathService] Error creating death record:', error)
      throw error
    }
  }

  async listAll(): Promise<DeathRecord[]> {
    return memoryDb.slice()
  }

  async update(phone: string, recordId: string, payload: DeathCreationPayload, endpoint = '/deaths'): Promise<{ id: string }> {
    const farmId = getFarmIdForPhone(phone)

    try {
      const url = `${this.servicePrefix}/${farmId}${endpoint}/${recordId}`
      await api.put(url, { data: { ...payload, farmId } })

      const index = memoryDb.findIndex((record) => String(record.id) === recordId)
      if (index !== -1) {
        memoryDb[index] = {
          ...payload,
          id: recordId,
          createdAt: memoryDb[index].createdAt,
        }
      }

      return { id: recordId }
    } catch (error) {
      console.error('[DeathService] Error updating death record:', error)
      throw error
    }
  }

  async patch(phone: string, recordId: string, payload: Partial<DeathCreationPayload>, endpoint = '/deaths'): Promise<{ id: string }> {
    const farmId = getFarmIdForPhone(phone)

    try {
      const url = `${this.servicePrefix}/${farmId}${endpoint}/${recordId}`

      await api.patch(url, { data: payload })

      const index = memoryDb.findIndex((record) => String(record.id) === recordId)
      if (index !== -1) {
        memoryDb[index] = {
          ...memoryDb[index],
          ...payload,
        }
      }

      console.log(`[DeathService] Registro ${recordId} atualizado parcialmente via PATCH`)
      return { id: recordId }
    } catch (error) {
      console.error('[DeathService] Error patching death record:', error)
      throw error
    }
  }

  async delete(phone: string, recordId: string, endpoint = '/deaths'): Promise<{ id: string }> {
    const farmId = getFarmIdForPhone(phone)

    try {
      const url = `${this.servicePrefix}/${farmId}${endpoint}/${recordId}`
      await api.delete(url)

      const index = memoryDb.findIndex((record) => String(record.id) === recordId)
      if (index !== -1) {
        memoryDb.splice(index, 1)
      }

      return { id: recordId }
    } catch (error) {
      console.error('[DeathService] Error deleting death record:', error)
      throw error
    }
  }
}
