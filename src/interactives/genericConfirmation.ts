import { sendWhatsAppMessage } from '../api/meta.api'

interface SendSingleActionButtonOptions {
  namespace: string
  userId: string
  message: string
  buttonLabel: string
  summaryText?: string
  onAction?: (userId: string) => Promise<void>
}

/**
 * Stub function to send a single action button
 * In a full implementation, this would send an interactive WhatsApp message with a button
 */
export async function sendSingleActionButton(options: SendSingleActionButtonOptions): Promise<void> {
  const { userId, message, buttonLabel } = options
  // For now, just send a text message with the button prompt
  const fullMessage = `${message}\n\nDigite "${buttonLabel}" para continuar.`
  await sendWhatsAppMessage(userId, fullMessage)
}
