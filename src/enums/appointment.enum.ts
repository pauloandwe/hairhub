export enum CreateAppointmentFields {
  Service = 'service',
  Barber = 'barber',
  Date = 'date',
  Time = 'time',
  Notes = 'notes',
}

export enum RescheduleAppointmentFields {
  AppointmentId = 'appointmentId',
  NewDate = 'newDate',
  NewTime = 'newTime',
  Reason = 'reason',
}

export enum CancelAppointmentFields {
  AppointmentId = 'appointmentId',
  Reason = 'reason',
}
