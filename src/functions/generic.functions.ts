import { ChangeResponse } from '../services/drafts/types'

export const Response = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})
