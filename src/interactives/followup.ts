import { sendWhatsAppMessage } from '../api/meta.api'
import { FlowType } from '../enums/generic.enum'
import { getUserContext } from '../env.config'
import { appointmentFunctions } from '../functions/appointments/appointment.functions'
import { appointmentRescheduleFunctions } from '../functions/appointments/reschedule/appointment-reschedule.functions'
import { simplifiedExpenseFunctions } from '../functions/finances/simplifiedExpense/simplifiedExpense.functions'
import { birthFunctions } from '../functions/livestocks/birth/birth.functions'
import { deathFunctions } from '../functions/livestocks/death/death.functions'
import { saleFunctions } from '../functions/livestocks/selling/selling.functions'

type ContinuationFunction = (userId: string) => Promise<void>
type CancellationFunction = (userId: string) => Promise<void>

const continuationStrategies: Readonly<Record<string, ContinuationFunction>> = {
  [FlowType.Death]: continueDeathRegistration,
  [FlowType.Birth]: continueBirthRegistration,
  [FlowType.SimplifiedExpense]: continueSimplifiedExpenseRegistration,
  [FlowType.Selling]: continueSaleRegistration,
  [FlowType.Appointment]: continueAppointmentRegistration,
  [FlowType.AppointmentReschedule]: continueAppointmentReschedule,
} as const

const cancellationStrategies: Readonly<Record<string, CancellationFunction>> = {
  [FlowType.Death]: cancelDeathRegistration,
  [FlowType.Birth]: cancelBirthRegistration,
  [FlowType.SimplifiedExpense]: cancelSimplifiedExpenseRegistration,
  [FlowType.Selling]: cancelSaleRegistration,
  [FlowType.Appointment]: cancelAppointmentRegistration,
  [FlowType.AppointmentReschedule]: cancelAppointmentReschedule,
} as const

export async function tryContinueRegistration(userId: string): Promise<void> {
  const ctx = await getUserContext(userId)
  const activeType = ctx?.activeRegistration?.type

  if (ctx?.activeRegistration?.editMode) {
    return
  }

  if (!activeType) {
    console.warn('No active registration type found for user:', userId)
    await sendWhatsAppMessage(userId, 'Não encontrei nenhum cadastro ativo, por favor me diga qual cadastro deseja iniciar.')
    return
  }

  const continuationFn = continuationStrategies[activeType]
  if (!continuationFn) {
    console.warn('No continuation strategy found for type:', activeType)
    await sendWhatsAppMessage(userId, 'Ops! Algo deu errado com seu cadastro, por favor tente novamente mais tarde.')
    return
  }

  await continuationFn(userId)
}

export async function cancelActiveRegistration(userId: string): Promise<void> {
  const ctx = await getUserContext(userId)
  const activeType = ctx?.activeRegistration?.type

  if (!activeType) {
    await sendWhatsAppMessage(userId, 'Não encontrei nenhum cadastro ativo para cancelar.')
    return
  }

  const cancelFn = cancellationStrategies[activeType]
  if (!cancelFn) {
    await sendWhatsAppMessage(userId, 'Ainda não sei cancelar esse cadastro automaticamente. Posso tentar outra coisa pra você?')
    return
  }

  await cancelFn(userId)
}

async function continueDeathRegistration(userId: string): Promise<void> {
  await deathFunctions.continueAnimalDeathRegistration({ phone: userId })
}

async function continueBirthRegistration(userId: string): Promise<void> {
  await birthFunctions.startAnimalBirthRegistration({ phone: userId })
}

async function continueSimplifiedExpenseRegistration(userId: string): Promise<void> {
  await simplifiedExpenseFunctions.startExpenseRegistration({ phone: userId })
}

async function continueSaleRegistration(userId: string): Promise<void> {
  await saleFunctions.continueSaleRegistration({ phone: userId })
}

async function continueAppointmentRegistration(userId: string): Promise<void> {
  await appointmentFunctions.continueAppointmentRegistration({ phone: userId })
}

async function cancelDeathRegistration(userId: string): Promise<void> {
  await deathFunctions.cancelAnimalDeathRegistration({ phone: userId })
}

async function cancelBirthRegistration(userId: string): Promise<void> {
  await birthFunctions.cancelAnimalBirthRegistration({ phone: userId })
}

async function cancelSimplifiedExpenseRegistration(userId: string): Promise<void> {
  await simplifiedExpenseFunctions.cancelSimplifiedExpenseRegistration({ phone: userId })
}

async function cancelSaleRegistration(userId: string): Promise<void> {
  await saleFunctions.cancelSaleRegistration({ phone: userId })
}

async function cancelAppointmentRegistration(userId: string): Promise<void> {
  await appointmentFunctions.cancelAppointmentRegistration({ phone: userId })
}

async function continueAppointmentReschedule(userId: string): Promise<void> {
  await appointmentRescheduleFunctions.continueRegistration({ phone: userId })
}

async function cancelAppointmentReschedule(userId: string): Promise<void> {
  await appointmentRescheduleFunctions.cancelAppointmentReschedule({ phone: userId })
}
