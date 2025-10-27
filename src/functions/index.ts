import { areasFunctions } from './areas/areas.functions'
import { weatherFunctions } from './farms/weather.functions'
import { farmsFunctions } from './farms/farms.functions'
import { animalLotFunctions } from './feed-control/aniamalLot.functions'
import { dashboardFunctions } from './finances/dashboard.functions'
import { productCategoriesFunctions } from './finances/productCategories.functions'
import { dateFunctions } from './utils/date.functions'
import { institutionFunctions } from './users/institution.functions'
import { deathCauseFunctions } from './livestocks/deathCause.functions'
import { locationSelectionFunctions } from './livestocks/locationSelection.functions'
import { ageCategoryFunctions } from './livestocks/ageCategory.functions'
import { birthFunctions } from './livestocks/birth/birth.functions'
import { deathFunctions } from './livestocks/death/death.functions'
import { simplifiedExpenseFunctions } from './finances/simplifiedExpense/simplifiedExpense.functions'
import { unsupportedRegistrationFunctions } from './utils/unsupportedRegistration.functions'
import { unsupportedQueryFunctions } from './utils/unsupportedQuery.functions'
import { appointmentFunctions } from './appointments/appointment.functions'
import { appointmentQueryFunctions } from './appointments/appointment-queries.functions'

export const allFunctions = {
  ...animalLotFunctions,
  ...weatherFunctions,
  ...dashboardFunctions,
  ...productCategoriesFunctions,
  ...dateFunctions,
  ...areasFunctions,
  ...farmsFunctions,
  ...institutionFunctions,
  ...deathCauseFunctions,
  ...locationSelectionFunctions,
  ...ageCategoryFunctions,
  ...birthFunctions,
  ...deathFunctions,
  ...simplifiedExpenseFunctions,
  ...appointmentFunctions,
  ...appointmentQueryFunctions,
  ...unsupportedRegistrationFunctions,
  ...unsupportedQueryFunctions,
  editDeathRecordField: deathFunctions.editDeathRecordField,
  editExpenseRecordField: simplifiedExpenseFunctions.editExpenseRecordField,
  editBirthRecordField: birthFunctions.editBirthRecordField,
  editAppointmentRecordField: appointmentFunctions.editAppointmentRecordField,
}
