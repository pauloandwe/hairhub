import { RegistrationDraftBase } from '../services/generic/generic.types'

export type ChangeResponse = { message: string; interactive: boolean }
export type FieldEditor<TDraft extends RegistrationDraftBase = RegistrationDraftBase> = (phone: string, draft?: TDraft) => Promise<ChangeResponse>
