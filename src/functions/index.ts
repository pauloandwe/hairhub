import { appointmentFunctions } from './appointments/appointment.functions'
import { appointmentQueriesFunctions } from './appointments/appointment-queries.functions'
import { dateFunctions } from './utils/date.functions'
import { unsupportedRegistrationFunctions } from './utils/unsupportedRegistration.functions'
import { unsupportedQueryFunctions } from './utils/unsupportedQuery.functions'

export const allFunctions = {
  ...appointmentFunctions,
  ...appointmentQueriesFunctions,
  ...dateFunctions,
  ...unsupportedRegistrationFunctions,
  ...unsupportedQueryFunctions,
}
