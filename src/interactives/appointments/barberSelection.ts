import { sendWhatsAppMessageWithTitle } from '../../api/meta.api'

export async function sendBarberSelectionList(phone: string, message: string): Promise<void> {
  // TODO: Integrar com API de barbeiros para obter lista real
  await sendWhatsAppMessageWithTitle(phone, message || 'Qual barbeiro você prefere?')
}
