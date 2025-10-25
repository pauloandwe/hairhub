export type TriggerArgs = { phone: string }
export type TriggerReturn = { message: string; interactive: true }
export type TriggerFn = (args: TriggerArgs) => Promise<TriggerReturn>

export interface TriggerEntry {
  name: string
  sendList: (phone: string) => Promise<void>
  message: string
}

export function buildTriggerFunctions(entries: TriggerEntry[]): Record<string, TriggerFn> {
  const map: Record<string, TriggerFn> = {}
  for (const e of entries) {
    map[e.name] = async ({ phone }: TriggerArgs): Promise<TriggerReturn> => {
      await e.sendList(phone)
      return { message: e.message, interactive: true } as const
    }
  }
  return map
}
