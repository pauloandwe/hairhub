import { sendWhatsAppMessageWithTitle } from '../../api/meta.api'

export async function sendServiceSelectionList(phone: string, message: string): Promise<void> {
  // TODO: Integrar com API de serviços para obter lista real
  await sendWhatsAppMessageWithTitle(phone, message || 'Qual serviço você quer?')
}
