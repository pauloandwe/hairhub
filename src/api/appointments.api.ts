import { Appointment, AppointmentCreatePayload, AppointmentStatus, AvailableSlot } from '../types/appointment.types'
import { v4 as uuidv4 } from 'uuid'
import { getOrCreateBusinessConfig } from './business.api'
import { WorkingHours } from '../types/business.types'

// Mock storage
const appointmentsStore = new Map<string, Appointment>()
const appointmentsByPhone = new Map<string, string[]>()
const appointmentsByBusiness = new Map<string, string[]>()

/**
 * Create a new appointment
 */
export async function createAppointment(data: AppointmentCreatePayload): Promise<Appointment> {
  const now = new Date().toISOString()

  const appointment: Appointment = {
    id: uuidv4(),
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    barberId: data.barberId,
    barberName: '', // Will be filled from business config
    serviceId: data.serviceId,
    serviceName: '', // Will be filled from business config
    dateTime: data.dateTime,
    duration: data.duration,
    status: AppointmentStatus.SCHEDULED,
    businessId: data.businessId,
    notes: data.notes,
    createdAt: now,
    updatedAt: now,
  }

  // Get business config to fill names
  const businessConfig = await getOrCreateBusinessConfig(data.customerPhone)
  const barber = businessConfig.barbers.find((b) => b.id === data.barberId)
  const service = businessConfig.services.find((s) => s.id === data.serviceId)

  if (barber) appointment.barberName = barber.name
  if (service) appointment.serviceName = service.name

  // Store appointment
  appointmentsStore.set(appointment.id, appointment)

  // Index by phone
  const phoneAppointments = appointmentsByPhone.get(data.customerPhone) || []
  phoneAppointments.push(appointment.id)
  appointmentsByPhone.set(data.customerPhone, phoneAppointments)

  // Index by business
  const businessAppointments = appointmentsByBusiness.get(data.businessId) || []
  businessAppointments.push(appointment.id)
  appointmentsByBusiness.set(data.businessId, businessAppointments)

  return appointment
}

/**
 * Update an existing appointment
 */
export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment> {
  const existing = appointmentsStore.get(id)
  if (!existing) {
    throw new Error(`Appointment ${id} not found`)
  }

  const updated: Appointment = {
    ...existing,
    ...data,
    updatedAt: new Date().toISOString(),
  }

  appointmentsStore.set(id, updated)
  return updated
}

/**
 * Cancel an appointment
 */
export async function cancelAppointment(id: string, reason?: string): Promise<void> {
  const existing = appointmentsStore.get(id)
  if (!existing) {
    throw new Error(`Appointment ${id} not found`)
  }

  const updated: Appointment = {
    ...existing,
    status: AppointmentStatus.CANCELLED,
    notes: existing.notes ? `${existing.notes}\nMotivo cancelamento: ${reason}` : `Motivo cancelamento: ${reason}`,
    updatedAt: new Date().toISOString(),
  }

  appointmentsStore.set(id, updated)
}

/**
 * Get appointment by ID
 */
export async function getAppointment(id: string): Promise<Appointment | null> {
  return appointmentsStore.get(id) || null
}

/**
 * Get all appointments for a phone number
 */
export async function getAppointmentsByPhone(phone: string): Promise<Appointment[]> {
  const appointmentIds = appointmentsByPhone.get(phone) || []
  const appointments = appointmentIds.map((id) => appointmentsStore.get(id)).filter((a): a is Appointment => a !== undefined)

  // Sort by dateTime descending
  return appointments.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
}

/**
 * Get appointments for a business on a specific date
 */
export async function getAppointmentsByDate(businessId: string, date: string): Promise<Appointment[]> {
  const appointmentIds = appointmentsByBusiness.get(businessId) || []
  const appointments = appointmentIds.map((id) => appointmentsStore.get(id)).filter((a): a is Appointment => a !== undefined)

  // Filter by date (YYYY-MM-DD)
  return appointments.filter((a) => {
    const appointmentDate = a.dateTime.split('T')[0]
    return appointmentDate === date && a.status !== AppointmentStatus.CANCELLED
  })
}

/**
 * Get next appointment for a phone number
 */
export async function getNextAppointment(phone: string): Promise<Appointment | null> {
  const appointments = await getAppointmentsByPhone(phone)
  const now = new Date()

  // Filter future appointments that are not cancelled
  const futureAppointments = appointments
    .filter((a) => new Date(a.dateTime) > now && a.status !== AppointmentStatus.CANCELLED)
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  return futureAppointments[0] || null
}

/**
 * Get upcoming appointments for a phone number
 */
export async function getUpcomingAppointments(phone: string, limit: number = 5): Promise<Appointment[]> {
  const appointments = await getAppointmentsByPhone(phone)
  const now = new Date()

  // Filter future appointments that are not cancelled
  const futureAppointments = appointments
    .filter((a) => new Date(a.dateTime) > now && a.status !== AppointmentStatus.CANCELLED)
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  return futureAppointments.slice(0, limit)
}

/**
 * Get available time slots for a date and service
 */
export async function getAvailableSlots(
  businessId: string,
  date: string,
  serviceId: string,
  barberId?: string
): Promise<AvailableSlot[]> {
  // This is a simplified version - in production would need more complex logic
  const businessConfig = await getOrCreateBusinessConfig('default') // TODO: get by businessId
  const service = businessConfig.services.find((s) => s.id === serviceId)
  if (!service) return []

  // Get day of week
  const dateObj = new Date(date + 'T00:00:00')
  const dayOfWeek = dateObj.getDay()

  // Get working hours for this day
  const workingHours = businessConfig.workingHours.find((wh) => wh.dayOfWeek === dayOfWeek)
  if (!workingHours || workingHours.closed) return []

  // Get barbers
  const barbers = barberId ? businessConfig.barbers.filter((b) => b.id === barberId) : businessConfig.barbers

  // Get existing appointments for this date
  const existingAppointments = await getAppointmentsByDate(businessId, date)

  // Generate slots
  const slots: AvailableSlot[] = []
  const serviceDuration = service.duration

  for (const barber of barbers) {
    const barberAppointments = existingAppointments.filter((a) => a.barberId === barber.id)

    // Generate time slots from open to close, every 30 minutes
    const startHour = parseInt(workingHours.openTime.split(':')[0])
    const startMinute = parseInt(workingHours.openTime.split(':')[1])
    const endHour = parseInt(workingHours.closeTime.split(':')[0])
    const endMinute = parseInt(workingHours.closeTime.split(':')[1])

    let currentHour = startHour
    let currentMinute = startMinute

    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
      const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`
      const slotDateTime = `${date}T${timeString}:00`

      // Check if slot is during break time
      const isDuringBreak =
        workingHours.breakStart &&
        workingHours.breakEnd &&
        timeString >= workingHours.breakStart &&
        timeString < workingHours.breakEnd

      // Check if barber has appointment at this time
      const hasConflict = barberAppointments.some((apt) => {
        const aptStart = new Date(apt.dateTime)
        const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000)
        const slotStart = new Date(slotDateTime)
        const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60000)

        // Check for overlap
        return slotStart < aptEnd && slotEnd > aptStart
      })

      if (!isDuringBreak && !hasConflict) {
        slots.push({
          date,
          time: timeString,
          barberId: barber.id,
          barberName: barber.name,
          available: true,
        })
      }

      // Increment by 30 minutes
      currentMinute += 30
      if (currentMinute >= 60) {
        currentMinute -= 60
        currentHour += 1
      }
    }
  }

  return slots
}

/**
 * Clear all appointments (for testing)
 */
export function clearAllAppointments(): void {
  appointmentsStore.clear()
  appointmentsByPhone.clear()
  appointmentsByBusiness.clear()
}
