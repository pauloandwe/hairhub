import { sendWhatsAppMessageWithTitle } from '../../api/meta.api'

export async function sendTimeSlotSelectionList(phone: string, message: string): Promise<void> {
  // TODO: Integrar com API de horários disponíveis para obter lista real
  await sendWhatsAppMessageWithTitle(phone, message || 'Qual horário você prefere?')
}
