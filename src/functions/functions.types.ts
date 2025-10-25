export type ChangeResponse = { message: string; interactive: boolean }
export type FieldEditor = (phone: string) => Promise<ChangeResponse>
