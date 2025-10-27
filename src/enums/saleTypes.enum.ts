export enum SellingTypesEnum {
  SLAUGHTER = 1,
  CONSUMPTION = 2,
  DONATION = 3,
  TRANSFER = 4,
  SALE = 5,
}

export const SellingTypesLabels: Record<SellingTypesEnum, string> = {
  [SellingTypesEnum.SLAUGHTER]: 'Abate',
  [SellingTypesEnum.CONSUMPTION]: 'Consumo',
  [SellingTypesEnum.DONATION]: 'Doação',
  [SellingTypesEnum.TRANSFER]: 'Transferência',
  [SellingTypesEnum.SALE]: 'Venda',
}
