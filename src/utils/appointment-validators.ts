import { Appointment } from '../types/appointment.types'
import { WorkingHours } from '../types/business.types'
import { getDayOfWeek, isDateInPast, parseTime, addMinutes } from './time.utils'

/**
 * Check if a given date is a working day for the business
 */
export function isWorkingDay(date: string, workingHours: WorkingHours[]): boolean {
  const dayOfWeek = getDayOfWeek(date)
  const workingDay = workingHours.find((wh) => wh.dayOfWeek === dayOfWeek)

  if (!workingDay) return false
  return !workingDay.closed
}

/**
 * Check if a time is within working hours
 */
export function isWithinWorkingHours(time: string, date: string, workingHours: WorkingHours[]): boolean {
  const dayOfWeek = getDayOfWeek(date)
  const workingDay = workingHours.find((wh) => wh.dayOfWeek === dayOfWeek)

  if (!workingDay || workingDay.closed) return false

  return time >= workingDay.openTime && time < workingDay.closeTime
}

/**
 * Check if time is during break hours
 */
export function isDuringBreak(time: string, date: string, workingHours: WorkingHours[]): boolean {
  const dayOfWeek = getDayOfWeek(date)
  const workingDay = workingHours.find((wh) => wh.dayOfWeek === dayOfWeek)

  if (!workingDay || !workingDay.breakStart || !workingDay.breakEnd) return false

  return time >= workingDay.breakStart && time < workingDay.breakEnd
}

/**
 * Check if datetime is in the future
 */
export function isFutureDateTime(date: string, time: string): boolean {
  const dateTime = new Date(`${date}T${time}:00`)
  const now = new Date()
  return dateTime > now
}

/**
 * Check if there's a time conflict with existing appointments
 */
export function hasTimeConflict(
  date: string,
  time: string,
  duration: number,
  barberId: string,
  existingAppointments: Appointment[],
  excludeAppointmentId?: string
): boolean {
  const newStart = new Date(`${date}T${time}:00`)
  const newEnd = new Date(newStart.getTime() + duration * 60000)

  // Filter appointments for the same barber on the same day
  const relevantAppointments = existingAppointments.filter((apt) => {
    if (apt.id === excludeAppointmentId) return false // Exclude appointment being rescheduled
    if (apt.barberId !== barberId) return false
    if (apt.status === 'CANCELLED') return false

    const aptDate = apt.dateTime.split('T')[0]
    return aptDate === date
  })

  // Check for overlaps
  for (const apt of relevantAppointments) {
    const aptStart = new Date(apt.dateTime)
    const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000)

    // Check if times overlap
    if (newStart < aptEnd && newEnd > aptStart) {
      return true
    }
  }

  return false
}

/**
 * Calculate end time based on start time and duration
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  return addMinutes(startTime, durationMinutes)
}

/**
 * Validate if appointment can be created
 */
export interface AppointmentValidationResult {
  valid: boolean
  error?: string
}

export function validateAppointmentTime(
  date: string,
  time: string,
  duration: number,
  barberId: string,
  workingHours: WorkingHours[],
  existingAppointments: Appointment[]
): AppointmentValidationResult {
  // Check if date is in the past
  if (isDateInPast(date)) {
    return { valid: false, error: 'Essa data já passou! Escolha uma data futura.' }
  }

  // Check if datetime is in the future
  if (!isFutureDateTime(date, time)) {
    return { valid: false, error: 'Esse horário já passou! Escolha um horário futuro.' }
  }

  // Check if it's a working day
  if (!isWorkingDay(date, workingHours)) {
    return { valid: false, error: 'Estamos fechados nesse dia. Escolha outro dia da semana.' }
  }

  // Check if within working hours
  if (!isWithinWorkingHours(time, date, workingHours)) {
    const dayOfWeek = getDayOfWeek(date)
    const workingDay = workingHours.find((wh) => wh.dayOfWeek === dayOfWeek)
    const hours = workingDay ? `${workingDay.openTime} às ${workingDay.closeTime}` : 'indisponível'
    return {
      valid: false,
      error: `Não atendemos nesse horário. Nosso funcionamento é: ${hours}`,
    }
  }

  // Check if during break
  if (isDuringBreak(time, date, workingHours)) {
    return { valid: false, error: 'Esse horário é durante o intervalo de almoço. Escolha outro horário.' }
  }

  // Check for conflicts
  if (hasTimeConflict(date, time, duration, barberId, existingAppointments)) {
    return { valid: false, error: 'Esse horário já está ocupado. Escolha outro horário disponível.' }
  }

  return { valid: true }
}

/**
 * Check if appointment can be cancelled (based on deadline)
 */
export function canCancelAppointment(appointment: Appointment, deadlineHours: number): boolean {
  const appointmentTime = new Date(appointment.dateTime)
  const now = new Date()
  const hoursUntilAppointment = (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60)

  return hoursUntilAppointment >= deadlineHours
}

/**
 * Check if appointment can be rescheduled (based on deadline)
 */
export function canRescheduleAppointment(appointment: Appointment, deadlineHours: number): boolean {
  return canCancelAppointment(appointment, deadlineHours)
}
