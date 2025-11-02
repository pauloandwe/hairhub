import api from '../../config/api.config'
import { unwrapApiResponse } from '../../utils/http'

export interface InstitutionSummary {
  id: string
  name: string
}

export class InstitutionService {
  private servicePrefix = process.env.USERS_URL

  async listInstitutions(phone: string): Promise<InstitutionSummary[]> {
    const params: any = {
      filters: 'isActive:true',
      pageSize: 100,
    }

    const response = await api.get(`${this.servicePrefix}/consultants/wallets/`, { params })

    const rawItems = unwrapApiResponse<any[]>(response) ?? []

    const mapped = rawItems
      .map((it) => ({
        id: String(it?.institutionId ?? it?.id ?? ''),
        name: String(it?.institutionName ?? it?.name ?? 'Instituição'),
      }))
      .filter((x) => !!x.id)

    const uniqueById = new Map<string, InstitutionSummary>()
    for (const m of mapped) uniqueById.set(String(m.id), m)

    return Array.from(uniqueById.values())
  }
}

export const institutionService = new InstitutionService()
