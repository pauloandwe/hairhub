import { getUserContextSync } from '../../env.config'
import { ChatDraftType, ChatMessage } from './types'
import { appendDeathDraftHistory, removeDeathDraftHistory } from '../livestocks/death-draft.service'
import { FlowType, FunctionTypeEnum } from '../../enums/generic.enum'
import { simplifiedExpenseService } from '../finances/simplifiedExpense/simplifiedExpenseService'
import { birthService } from '../livestocks/Birth/birthService'
import { sellingService } from '../livestocks/Selling/sellingService'
import { purchaseService } from '../livestocks/Purchase/purchaseService'

export class DraftHistoryService {
  appendActiveDraftHistory = async (userId: string, messages: ChatMessage[]): Promise<void> => {
    const type = getUserContextSync(userId)?.activeRegistration?.type as ChatDraftType | undefined
    if (!type || !messages?.length) return
    await this.appendDraftHistoryByType(userId, type, messages)
  }

  getAppendFunctionByType = (draftType: ChatDraftType, functionType: string): any | void => {
    switch (draftType) {
      case FlowType.SimplifiedExpense:
        switch (functionType) {
          case FunctionTypeEnum.APPEND:
            return simplifiedExpenseService.appendHistoryToDraft
          case FunctionTypeEnum.REMOVE:
            return simplifiedExpenseService.removeMessageFromDraftHistory
          default:
            return
        }
      case FlowType.Death:
        switch (functionType) {
          case FunctionTypeEnum.APPEND:
            return appendDeathDraftHistory
          case FunctionTypeEnum.REMOVE:
            return removeDeathDraftHistory
          default:
            return
        }
      case FlowType.Birth:
        switch (functionType) {
          case FunctionTypeEnum.APPEND:
            return birthService.appendHistoryToDraft
          case FunctionTypeEnum.REMOVE:
            return birthService.removeMessageFromDraftHistory
          default:
            return
        }
      case FlowType.Selling:
        switch (functionType) {
          case FunctionTypeEnum.APPEND:
            return sellingService.appendHistoryToDraft
          case FunctionTypeEnum.REMOVE:
            return sellingService.removeMessageFromDraftHistory
          default:
            return
        }
      default:
        return
    }
  }

  appendDraftHistoryByType = async (userId: string, type: ChatDraftType, messages: ChatMessage[]): Promise<void> => {
    const appendFunction = this.getAppendFunctionByType(type, FunctionTypeEnum.APPEND)
    if (appendFunction) {
      await appendFunction(userId, messages)
    }
  }

  removeDraftHistoryByType = async (userId: string, type: ChatDraftType, contentToRemove: string): Promise<boolean> => {
    const removeFunction = this.getAppendFunctionByType(type, FunctionTypeEnum.REMOVE)

    if (removeFunction) {
      return await removeFunction(userId, contentToRemove)
    }

    return false
  }

  removeActiveDraftHistory = async (userId: string, contentToRemove: string): Promise<boolean> => {
    const type = getUserContextSync(userId)?.activeRegistration?.type as ChatDraftType | undefined
    if (!type || !contentToRemove?.trim()) return false
    return await this.removeDraftHistoryByType(userId, type, contentToRemove)
  }
}

export const draftHistoryService = new DraftHistoryService()
