import { FlowType } from '../../enums/generic.enum'
import { ChatDraftEnvelope } from './types'

export async function getDraftHistory<T>(phone: string, flowType: FlowType): Promise<ChatDraftEnvelope<T> | null> {
  // Simplified - no longer needed for new implementation
  return null
}

export async function saveDraftHistory<T>(
  phone: string,
  flowType: FlowType,
  envelope: ChatDraftEnvelope<T>
): Promise<void> {
  // Simplified - no longer needed for new implementation
}
