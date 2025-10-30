import { sendWhatsAppMessageWithTitle } from '../../../api/meta.api'
import { SellingField } from '../../../enums/cruds/sellingFields.enum'
import { SellingTypesEnum, SellingTypesLabels } from '../../../enums/sellingTypes.enum'
import { sendSaleLocationSelectionList, sendSaleTypeSelectionList, sendSaleDestinationFarmSelectionList } from '../../../interactives/selling/saleSelection'
import { sendSaleCategoriesList } from '../../../interactives/selling/saleCategorySelection'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { ISellingsValidationDraft } from '../../../services/livestocks/Selling/selling.types'
import { FieldEditor } from '../../functions.types'
import { AnimalLotSelectionService } from '../../../services/livestocks/animal-lot.service'
import { sellingService } from '../../../services/livestocks/Selling/sellingService'

export type SaleEditField =
  | `${SellingField.SaleType}`
  | `${SellingField.SaleDate}`
  | `${SellingField.AliveWeight}`
  | `${SellingField.DeadWeight}`
  | `${SellingField.Quantity}`
  | `${SellingField.UnityValue}`
  | `${SellingField.ArrobaCost}`
  | `${SellingField.CarcassYield}`
  | `${SellingField.Category}`
  | `${SellingField.Retreat}`
  | `${SellingField.Area}`
  | `${SellingField.Observation}`
  | `${SellingField.DestinationFarm}`
  | `${SellingField.DestinationRetreat}`
  | `${SellingField.DestinationArea}`
  | `${SellingField.IsExternalDestination}`
  | `${SellingField.Age}`
  | `${SellingField.AnimalLotId}`
  | `${SellingField.FatteningSystemId}`

export type SaleMissingField =
  | `${SellingField.SaleType}`
  | `${SellingField.SaleDate}`
  | `${SellingField.AliveWeight}`
  | `${SellingField.DeadWeight}`
  | `${SellingField.Quantity}`
  | `${SellingField.UnityValue}`
  | `${SellingField.ArrobaCost}`
  | `${SellingField.CarcassYield}`
  | `${SellingField.Category}`
  | `${SellingField.Retreat}`
  | `${SellingField.Area}`
  | `${SellingField.Observation}`
  | `${SellingField.DestinationFarm}`
  | `${SellingField.DestinationRetreat}`
  | `${SellingField.DestinationArea}`
  | `${SellingField.IsExternalDestination}`
  | `${SellingField.Age}`
  | `${SellingField.AnimalLotId}`
  | `${SellingField.FatteningSystemId}`

type ChangeResponse = { message: string; interactive: boolean }

const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const DEFAULT_SALE_TYPE_LABEL = SellingTypesLabels[SellingTypesEnum.SALE]

const resolveSaleTypeLabel = (saleType: ISellingsValidationDraft['saleType']): string => {
  if (!saleType) return DEFAULT_SALE_TYPE_LABEL
  return SellingTypesLabels[saleType] ?? DEFAULT_SALE_TYPE_LABEL
}

const resolveSaleTypeOperation = (saleType: ISellingsValidationDraft['saleType']): string => resolveSaleTypeLabel(saleType).toLowerCase()

const loadSaleTypeOperation = async (phone: string): Promise<string> => {
  const draft = await sellingService.loadDraft(phone)
  return resolveSaleTypeOperation(draft.saleType)
}

const askWithTitle = async (phone: string, message: string): Promise<void> => {
  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessageWithTitle(phone, message)
}

const editSaleType: FieldEditor = async (phone) => {
  await sendSaleTypeSelectionList(phone, 'Qual o tipo de venda? 👇')
  return respond('Menu de tipos de venda enviado', true)
}

const editSaleDate: FieldEditor = async (phone) => {
  const operation = await loadSaleTypeOperation(phone)
  const message = `Qual foi a data da operação de ${operation}? 📆`
  await askWithTitle(phone, message)
  return respond('Data solicitada', false)
}

const editAliveWeight: FieldEditor = async (phone) => {
  const message = 'Qual foi o peso vivo? (mínimo 40 kg) 📊'
  await askWithTitle(phone, message)
  return respond('Peso vivo solicitado', false)
}

const editDeadWeight: FieldEditor = async (phone) => {
  const message = 'Qual foi o peso morto? (mínimo 40 kg, não pode ser maior que o peso vivo) 📊'
  await askWithTitle(phone, message)
  return respond('Peso morto solicitado', false)
}

const editQuantity: FieldEditor = async (phone) => {
  const operation = await loadSaleTypeOperation(phone)
  const message = `Quantos animais/unidades participaram da operação de ${operation}? (mínimo 1) 🐄`
  await askWithTitle(phone, message)
  return respond('Quantidade solicitada', false)
}

const editUnityValue: FieldEditor = async (phone) => {
  const message = 'Qual foi o valor unitário? (mínimo R$ 1,00) 💰'
  await askWithTitle(phone, message)
  return respond('Valor unitário solicitado', false)
}

const editArrobaCost: FieldEditor = async (phone) => {
  const message = 'Qual foi o custo da arroba? (inteiro, mínimo R$ 1,00) 📈'
  await askWithTitle(phone, message)
  return respond('Custo da arroba solicitado', false)
}

const editCarcassYield: FieldEditor = async (phone) => {
  const message = 'Qual foi o rendimento de carcaça? (entre 0% e 100%) 📊'
  await askWithTitle(phone, message)
  return respond('Rendimento de carcaça solicitado', false)
}

const editCategory: FieldEditor = async (phone) => {
  await sendSaleCategoriesList(phone, 'Qual a categoria do gado? 👇')
  return respond('Menu de categorias enviado', true)
}

const editRetreat: FieldEditor = async (phone) => {
  await sendSaleLocationSelectionList(phone, 'Qual o retiro? 👇')
  return respond('Menu de localizações enviado', true)
}

const editArea: FieldEditor = async (phone) => {
  await sendSaleLocationSelectionList(phone, 'Qual a área? 👇')
  return respond('Menu de localizações enviado', true)
}

const editObservation: FieldEditor = async (phone) => {
  const operation = await loadSaleTypeOperation(phone)
  const message = `Alguma observação sobre a operação de ${operation}? (ou digite "pular" se não houver)`
  await askWithTitle(phone, message)
  return respond('Observação solicitada', false)
}

const editIsExternalDestination: FieldEditor = async (phone) => {
  const message = 'O destino é externo? (digite "sim" ou "não")'
  await askWithTitle(phone, message)
  return respond('Destino informado', false)
}

const editDestinationFarm: FieldEditor = async (phone) => {
  await sendSaleDestinationFarmSelectionList(phone, 'Qual a fazenda de destino? 👇')
  return respond('Menu de fazendas de destino enviado', true)
}

const editDestinationRetreat: FieldEditor = async (phone) => {
  const draft = await sellingService.loadDraft(phone)
  const destinationFarmId = draft.destinationFarm?.id

  if (!destinationFarmId) {
    return editDestinationFarm(phone, draft)
  }

  let itemsOverride

  try {
    const service = new AnimalLotSelectionService()
    itemsOverride = await service.listAnimalLots(String(destinationFarmId))
  } catch (error) {
    console.error(`[editDestinationRetreat] Erro ao buscar localizações da fazenda ${destinationFarmId}:`, error)
  }

  await sendSaleLocationSelectionList(phone, 'Qual o retiro de destino? 👇', 0, itemsOverride)
  return respond('Menu de retiros enviado', true)
}

const editDestinationArea: FieldEditor = async (phone) => {
  const draft = await sellingService.loadDraft(phone)
  const destinationFarmId = draft.destinationFarm?.id

  if (!destinationFarmId) {
    return editDestinationFarm(phone, draft)
  }

  let itemsOverride

  try {
    const service = new AnimalLotSelectionService()
    itemsOverride = await service.listAnimalLots(String(destinationFarmId))
  } catch (error) {
    console.error(`[editDestinationArea] Erro ao buscar localizações da fazenda ${destinationFarmId}:`, error)
  }

  await sendSaleLocationSelectionList(phone, 'Qual a área de destino? 👇', 0, itemsOverride)
  return respond('Menu de áreas enviado', true)
}

const editAge: FieldEditor = async (phone) => {
  const message = 'Qual é a idade do animal em meses?'
  await askWithTitle(phone, message)
  return respond('Idade solicitada', false)
}

const editAnimalLotId: FieldEditor = async (phone) => {
  const message = 'Qual o lote animal? (opcional)'
  await askWithTitle(phone, message)
  return respond('Lote animal solicitado', false)
}

const editFatteningSystemId: FieldEditor = async (phone) => {
  const message = 'Qual o sistema de engorda? (opcional)'
  await askWithTitle(phone, message)
  return respond('Sistema de engorda solicitado', false)
}

export const saleFieldEditors: Record<SaleEditField, FieldEditor> = {
  [SellingField.SaleType]: editSaleType,
  [SellingField.SaleDate]: editSaleDate,
  [SellingField.AliveWeight]: editAliveWeight,
  [SellingField.DeadWeight]: editDeadWeight,
  [SellingField.Quantity]: editQuantity,
  [SellingField.UnityValue]: editUnityValue,
  [SellingField.ArrobaCost]: editArrobaCost,
  [SellingField.CarcassYield]: editCarcassYield,
  [SellingField.Category]: editCategory,
  [SellingField.Retreat]: editRetreat,
  [SellingField.Area]: editArea,
  [SellingField.Observation]: editObservation,
  [SellingField.IsExternalDestination]: editIsExternalDestination,
  [SellingField.DestinationFarm]: editDestinationFarm,
  [SellingField.DestinationRetreat]: editDestinationRetreat,
  [SellingField.DestinationArea]: editDestinationArea,
  [SellingField.Age]: editAge,
  [SellingField.AnimalLotId]: editAnimalLotId,
  [SellingField.FatteningSystemId]: editFatteningSystemId,
}

type MissingFieldHandler = (phone: string, draft: ISellingsValidationDraft) => Promise<{ message: string; interactive: boolean; draft: ISellingsValidationDraft }>

const askSaleType: MissingFieldHandler = async (phone, draft) => {
  await sendSaleTypeSelectionList(phone, 'Qual o tipo de venda? 👇')
  return { message: 'Menu de tipos de venda enviado', interactive: true, draft }
}

const askSaleDate: MissingFieldHandler = async (phone, draft) => {
  const operation = resolveSaleTypeOperation(draft.saleType)
  const message = `Qual foi a data da operação de ${operation}? 📆`
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askAliveWeight: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual foi o peso vivo? (mínimo 40 kg) 📊'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askDeadWeight: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual foi o peso morto? (mínimo 40 kg, não pode ser maior que o peso vivo) 📊'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askQuantity: MissingFieldHandler = async (phone, draft) => {
  const operation = resolveSaleTypeOperation(draft.saleType)
  const message = `Quantos animais/unidades participaram da operação de ${operation}? (mínimo 1) 🐄`
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askUnityValue: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual foi o valor unitário? (mínimo R$ 1,00) 💰'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askArrobaCost: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual foi o custo da arroba? (inteiro, mínimo R$ 1,00) 📈'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askCarcassYield: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual foi o rendimento de carcaça? (entre 0% e 100%) 📊'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askCategory: MissingFieldHandler = async (phone, draft) => {
  await sendSaleCategoriesList(phone, 'Antes de continuar, selecione a categoria desejada.')
  return { message: 'Menu de categorias enviado', interactive: true, draft }
}

const askRetreatAndArea: MissingFieldHandler = async (phone, draft) => {
  await sendSaleLocationSelectionList(phone, 'Qual a localização (retiro/área)? 👇')
  return {
    message: 'Menu de localizações enviado',
    interactive: true,
    draft,
  }
}

const askObservation: MissingFieldHandler = async (phone, draft) => {
  const operation = resolveSaleTypeOperation(draft.saleType)
  const message = `Alguma observação sobre a operação de ${operation}? (ou digite "pular" se não houver)`
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askIsExternalDestination: MissingFieldHandler = async (phone, draft) => {
  const message = 'O destino é externo? (digite "sim" ou "não")'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askDestinationFarm: MissingFieldHandler = async (phone, draft) => {
  await sendSaleDestinationFarmSelectionList(phone, 'Qual a fazenda de destino? 👇')
  return { message: 'Menu de fazendas de destino enviado', interactive: true, draft }
}

const askDestinationLocation: MissingFieldHandler = async (phone, draft) => {
  const destinationFarmId = draft.destinationFarm?.id

  if (!destinationFarmId) {
    return askDestinationFarm(phone, draft)
  }

  let itemsOverride

  try {
    const service = new AnimalLotSelectionService()
    itemsOverride = await service.listAnimalLots(String(destinationFarmId))
  } catch (error) {
    console.error(`[askDestinationLocation] Erro ao buscar localizações da fazenda ${destinationFarmId}:`, error)
  }

  await sendSaleLocationSelectionList(phone, 'Qual a localização de destino? 👇', 0, itemsOverride)

  return {
    message: 'Menu de localizações enviado',
    interactive: true,
    draft,
  }
}

const askAge: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual é a idade do animal em meses?'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askAnimalLotId: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual o lote animal? (ou digite "pular" se não houver)'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

const askFatteningSystemId: MissingFieldHandler = async (phone, draft) => {
  const message = 'Qual o sistema de engorda? (ou digite "pular" se não houver)'
  await askWithTitle(phone, message)
  return { message, interactive: false, draft }
}

export const missingFieldHandlers: Record<SaleMissingField, MissingFieldHandler> = {
  [SellingField.SaleType]: askSaleType,
  [SellingField.SaleDate]: askSaleDate,
  [SellingField.AliveWeight]: askAliveWeight,
  [SellingField.DeadWeight]: askDeadWeight,
  [SellingField.Quantity]: askQuantity,
  [SellingField.UnityValue]: askUnityValue,
  [SellingField.ArrobaCost]: askArrobaCost,
  [SellingField.CarcassYield]: askCarcassYield,
  [SellingField.Category]: askCategory,
  [SellingField.Retreat]: askRetreatAndArea,
  [SellingField.Area]: askRetreatAndArea,
  [SellingField.Observation]: askObservation,
  [SellingField.IsExternalDestination]: askIsExternalDestination,
  [SellingField.DestinationFarm]: askDestinationFarm,
  [SellingField.DestinationRetreat]: askDestinationLocation,
  [SellingField.DestinationArea]: askDestinationLocation,
  [SellingField.Age]: askAge,
  [SellingField.AnimalLotId]: askAnimalLotId,
  [SellingField.FatteningSystemId]: askFatteningSystemId,
}
