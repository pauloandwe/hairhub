import { sendWhatsAppMessage } from '../../api/meta.api'
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'
import { AvailabilityResolutionCandidate } from '../../services/appointments/appointment.types'
import { APPOINTMENT_AVAILABILITY_RESOLUTION_NAMESPACE, appointmentIntentService } from '../../services/appointments/appointment-intent.service'
import { createSelectionFlow } from '../flows'

let isRegistered = false

const availabilityResolutionFlow = createSelectionFlow<AvailabilityResolutionCandidate>({
  namespace: APPOINTMENT_AVAILABILITY_RESOLUTION_NAMESPACE,
  type: 'resolveAppointmentAvailability',
  fetchItems: async (phone) => appointmentIntentService.getResolutionCandidates(phone),
  ui: {
    header: 'Escolha uma opcao',
    sectionTitle: 'Opcoes encontradas',
    buttonLabel: 'Ver opcoes',
  },
  defaultBody: 'Me diz qual opcao voce quer.',
  invalidSelectionMsg: 'Essa opcao nao esta mais valida. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei mais essas opcoes por aqui. Pode tentar de novo?',
  pageLimit: 10,
  titleBuilder: (item, index, baseIndex) => `${baseIndex + index + 1}. ${item.name}`,
  descriptionBuilder: (item) => item.description,
  onSelected: async ({ userId, item }) => {
    const nextArgs = await appointmentIntentService.consumeResolutionSelection(userId, item.id)
    if (!nextArgs) {
      await sendWhatsAppMessage(userId, 'Perdi essas opcoes por aqui. Pode me pedir de novo?')
      return
    }

    await appointmentFunctions.startAppointmentRegistration({
      phone: userId,
      ...nextArgs,
      intentMode: 'check_then_offer',
    })
  },
})

export function registerAppointmentAvailabilityResolutionHandler(): void {
  if (isRegistered) {
    return
  }

  isRegistered = true
}

export async function sendAppointmentAvailabilityResolutionList(userId: string): Promise<void> {
  const prompt = appointmentIntentService.getResolutionPrompt(userId) || 'Me diz qual opcao voce quer.'
  await availabilityResolutionFlow.sendList(userId, prompt)
}
