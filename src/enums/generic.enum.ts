export enum FlowType {
  AppointmentCreate = 'appointmentCreate',
  AppointmentReschedule = 'appointmentReschedule',
  AppointmentCancel = 'appointmentCancel',
}

export enum FlowStep {
  Initial = '',
  Editing = 'editing',
  Creating = 'creating',
}

export enum FunctionTypeEnum {
  APPEND = 'append',
  REMOVE = 'remove',
}

export enum FlowTypeTranslation {
  appointmentCreate = 'Agendamento',
  appointmentReschedule = 'Remarcação',
  appointmentCancel = 'Cancelamento',
}
