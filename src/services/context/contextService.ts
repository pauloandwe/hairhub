import { FlowType } from '../../enums/generic.enum'
import { getUserContext } from '../../env.config'
import { DefaultContextService } from '../defaultContext'

export class ContextService {
  private static instance: ContextService

  static getInstance(): ContextService {
    if (!ContextService.instance) {
      ContextService.instance = new ContextService()
    }
    return ContextService.instance
  }

  async getContextService(phone: string) {
    const userContext = await getUserContext(phone)
    const activeFlowType = userContext?.activeFlow?.type

    // For now, always use DefaultContext since we don't have specific context services yet
    // In the future, add specific context services for AppointmentCreate, Reschedule, Cancel
    return DefaultContextService.getInstance()
  }
}
