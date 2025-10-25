import { AppointmentDraft, AppointmentCreatePayload, Appointment } from '../../types/appointment.types'
import {
  getAppointmentDraft,
  setAppointmentDraft,
  clearAppointmentDraft,
  updateAppointmentDraftField,
  createEmptyDraft,
} from '../drafts/appointments/appointment.draft'
import { createAppointment, getAppointmentsByDate } from '../../api/appointments.api'
import { getOrCreateBusinessConfig } from '../../api/business.api'
import { validateAppointmentTime } from '../../utils/appointment-validators'
import { CreateAppointmentFields } from '../../enums/appointment.enum'

export class AppointmentService {
  /**
   * Get current draft for a phone
   */
  async getDraft(phone: string): Promise<AppointmentDraft> {
    const draft = await getAppointmentDraft(phone)
    return draft || createEmptyDraft()
  }

  /**
   * Update draft field
   */
  async updateField<K extends keyof AppointmentDraft>(
    phone: string,
    field: K,
    value: AppointmentDraft[K]
  ): Promise<AppointmentDraft> {
    await updateAppointmentDraftField(phone, field, value)
    return this.getDraft(phone)
  }

  /**
   * Clear draft
   */
  async clearDraft(phone: string): Promise<void> {
    await clearAppointmentDraft(phone)
  }

  /**
   * Get missing required fields
   */
  getMissingFields(draft: AppointmentDraft): CreateAppointmentFields[] {
    const missing: CreateAppointmentFields[] = []

    if (!draft.service) missing.push(CreateAppointmentFields.Service)
    if (!draft.barber) missing.push(CreateAppointmentFields.Barber)
    if (!draft.date) missing.push(CreateAppointmentFields.Date)
    if (!draft.time) missing.push(CreateAppointmentFields.Time)

    return missing
  }

  /**
   * Validate draft before creation
   */
  async validateDraft(phone: string, draft: AppointmentDraft): Promise<{ valid: boolean; error?: string }> {
    const missing = this.getMissingFields(draft)
    if (missing.length > 0) {
      return { valid: false, error: `Faltam informações: ${missing.join(', ')}` }
    }

    // Get business config
    const businessConfig = await getOrCreateBusinessConfig(phone)

    // Get existing appointments for validation
    const existingAppointments = await getAppointmentsByDate(businessConfig.id, draft.date!)

    // Validate time
    const validation = validateAppointmentTime(
      draft.date!,
      draft.time!,
      draft.duration!,
      draft.barberId!,
      businessConfig.workingHours,
      existingAppointments
    )

    return validation
  }

  /**
   * Create appointment from draft
   */
  async createFromDraft(phone: string, customerName: string): Promise<Appointment> {
    const draft = await this.getDraft(phone)

    // Validate
    const validation = await this.validateDraft(phone, draft)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // Get business config
    const businessConfig = await getOrCreateBusinessConfig(phone)

    // Transform to payload
    const payload: AppointmentCreatePayload = {
      customerName,
      customerPhone: phone,
      barberId: draft.barberId!,
      serviceId: draft.serviceId!,
      dateTime: `${draft.date}T${draft.time}:00`,
      duration: draft.duration!,
      businessId: businessConfig.id,
      notes: draft.notes || undefined,
    }

    // Create appointment
    const appointment = await createAppointment(payload)

    // Clear draft after success
    await this.clearDraft(phone)

    return appointment
  }

  /**
   * Build summary string for confirmation
   */
  buildSummary(draft: AppointmentDraft): string {
    const lines: string[] = []

    if (draft.service) lines.push(`✂️ Serviço: ${draft.service.name}`)
    if (draft.barber) lines.push(`💈 Barbeiro: ${draft.barber.name}`)
    if (draft.date && draft.time) {
      const dateObj = new Date(draft.date + 'T00:00:00')
      const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
      const dayOfWeek = daysOfWeek[dateObj.getDay()]
      lines.push(`📅 ${dayOfWeek}, ${draft.date.split('-').reverse().join('/')} às ${draft.time}`)
    }
    if (draft.notes) lines.push(`📝 ${draft.notes}`)

    return lines.join('\n')
  }
}

// Singleton instance
export const appointmentService = new AppointmentService()
