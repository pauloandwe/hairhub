export enum LivestockEntryTypesEnum {
  PURCHASE = 1,
  TRANSFER = 2,
  STARTING_STOCK = 3,
}

export const LivestockEntryTypesLabels: Record<LivestockEntryTypesEnum, string> = {
  [LivestockEntryTypesEnum.PURCHASE]: 'Compra',
  [LivestockEntryTypesEnum.TRANSFER]: 'Transferência',
  [LivestockEntryTypesEnum.STARTING_STOCK]: 'Estoque inicial',
}
