import type { SelectArrayItem } from './converters.type'

export function convertEnumToSelectArray<E extends Record<string, string | number>, El extends Record<keyof E, string>>(Enum: E, EnumLabels: El, shouldReturnBoolean?: boolean): Array<SelectArrayItem> {
  return Object.keys(Enum as any)
    .filter((key) => isNaN(Number(key)))
    .map((key) => {
      return {
        id: shouldReturnBoolean ? Enum[key] === 1 : Enum[key],
        key: key,
        name: EnumLabels[key as keyof typeof EnumLabels],
      }
    })
}
