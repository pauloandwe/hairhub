import { sendWhatsAppMessage } from '../../api/meta.api'
import { FlowType } from '../../enums/generic.enum'
import { SellingTypesEnum, SellingTypesLabels } from '../../enums/sellingTypes.enum'
import { AnimalLotOption, AnimalLotSelectionService } from '../../services/livestocks/animal-lot.service'
import { getUserContext, setUserContext, getUserContextSync } from '../../env.config'
import { createSelectionFlow } from '../flows'
import { tryContinueRegistration } from '../followup'
import { saleFunctions } from '../../functions/livestocks/selling/selling.functions'
import { SelectArrayItem } from '../../helpers/converters/converters.type'
import { sellingService } from '../../services/livestocks/Selling/sellingService'
import { getSelectionAck } from '../../utils/conversation-copy'

export const SALE_TYPE_NAMESPACE = 'SALE_TYPE'

const saleTypeItems: SelectArrayItem[] = [
  { id: SellingTypesEnum.SLAUGHTER, key: String(SellingTypesEnum.SLAUGHTER), name: SellingTypesLabels[SellingTypesEnum.SLAUGHTER] },
  { id: SellingTypesEnum.CONSUMPTION, key: String(SellingTypesEnum.CONSUMPTION), name: SellingTypesLabels[SellingTypesEnum.CONSUMPTION] },
  { id: SellingTypesEnum.DONATION, key: String(SellingTypesEnum.DONATION), name: SellingTypesLabels[SellingTypesEnum.DONATION] },
  { id: SellingTypesEnum.TRANSFER, key: String(SellingTypesEnum.TRANSFER), name: SellingTypesLabels[SellingTypesEnum.TRANSFER] },
  { id: SellingTypesEnum.SALE, key: String(SellingTypesEnum.SALE), name: SellingTypesLabels[SellingTypesEnum.SALE] },
]

const saleTypesFlow = createSelectionFlow<SelectArrayItem>({
  namespace: SALE_TYPE_NAMESPACE,
  type: 'selectSaleType',
  fetchItems: async () => {
    return saleTypeItems
  },
  ui: {
    header: 'Qual tipo de venda?',
    sectionTitle: 'Tipos de Venda',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Qual tipo de venda voce quer registrar?',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei tipos de venda por aqui.',
  pageLimit: 10,
  titleBuilder: (c, idx, base) => `${base + idx + 1}. ${c.name}`,
  descriptionBuilder: () => 'Escolher',
  onSelected: async ({ userId, item }) => {
    await getUserContext(userId)
    const ctx = getUserContextSync(userId)

    await setUserContext(userId, {
      saleTypeId: item.id,
      saleTypeName: item.name,
    })

    if (ctx?.activeRegistration?.type === FlowType.Selling) {
      await sellingService.updateDraftField(userId, 'saleType', item.id)
    }
    await sendWhatsAppMessage(userId, getSelectionAck('generic', item.name))
    await tryContinueRegistration(userId)
  },
  onEditModeSelected: async ({ userId, item }) => {
    await saleFunctions.applySellingsRecordUpdates({
      phone: userId,
      updates: { saleType: item.id },
      logContext: `Tipo de venda atualizado para ${item.name}`,
    })
  },
})

export async function sendSaleTypeSelectionList(userId: string, bodyMsg = 'Qual tipo de venda voce quer registrar?', offset = 0) {
  await saleTypesFlow.sendList(userId, bodyMsg, offset)
}

export const SALE_LOCATION_NAMESPACE = 'SALE_LOCATION'

const saleLocationSelector = buildSaleLocationSelectionFlow({
  namespace: SALE_LOCATION_NAMESPACE,
  flowType: FlowType.Selling,
  defaultBody: 'Me diz em qual localizacao aconteceu a venda.',
})

function buildSaleLocationSelectionFlow(config: { namespace: string; flowType: FlowType; defaultBody: string }) {
  const flow = createSelectionFlow<AnimalLotOption>({
    namespace: config.namespace,
    type: 'selectLocation',
    fetchItems: async (userId) => {
      const service = new AnimalLotSelectionService()
      return service.listAnimalLots('1')
    },
    ui: {
      header: 'Qual a localização?',
      sectionTitle: 'Localizações',
      buttonLabel: 'Ver opções',
    },
    defaultBody: config.defaultBody,
    invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
    emptyListMessage: 'Nao encontrei localizacoes por aqui.',
    pageLimit: 10,
    titleBuilder: (option, idx, base) => `${base + idx + 1}. ${option.lotName ? option.lotName : option.areaName}`,
    descriptionBuilder: (option) => (option.lotName ? `${option.retreatName} -> ${option.areaName} -> ${option.lotName}` : `${option.retreatName} -> ${option.areaName}`),
    onSelected: async ({ userId, item }) => {
      await getUserContext(userId)
      await setUserContext(userId, {
        retreatId: item.retreatId,
        retreatName: item.retreatName,
        areaId: item.areaId,
        areaName: item.areaName,
        animalLotId: item.lotId || undefined,
        animalLotName: item.lotName || undefined,
      })

      if (getUserContextSync(userId)?.activeRegistration?.type === config.flowType) {
        try {
          await sellingService.updateDraftField(userId, 'retreat', { id: item.retreatId, name: item.retreatName })
          await sellingService.updateDraftField(userId, 'area', { id: item.areaId, name: item.areaName })
        } catch (error) {
          console.error(`[SaleLocationSelection] Falha ao atualizar o rascunho após a seleção`, error)
        }
      }

      const path = item.lotName ? `${item.retreatName} -> ${item.areaName} -> ${item.lotName}` : `${item.retreatName} -> ${item.areaName}`
      await sendWhatsAppMessage(userId, getSelectionAck('location', path))
      await tryContinueRegistration(userId)
    },
    onEditModeSelected: async ({ userId, item }) => {
      await saleFunctions.applySellingsRecordUpdates({
        phone: userId,
        updates: { retreat: { id: item.retreatId, name: item.retreatName }, area: { id: item.areaId, name: item.areaName } },
        logContext: `Localização atualizada para ${item.retreatName} -> ${item.areaName}`,
      })
    },
  })

  const sendList = async (userId: string, bodyMsg = config.defaultBody, offset = 0, itemsOverride?: AnimalLotOption[]) => {
    await flow.sendList(userId, bodyMsg, offset, itemsOverride)
  }

  return { sendList }
}

export async function sendSaleLocationSelectionList(userId: string, bodyMsg = 'Me diz em qual localizacao aconteceu a venda.', offset = 0, itemsOverride?: AnimalLotOption[]) {
  await saleLocationSelector.sendList(userId, bodyMsg, offset, itemsOverride)
}

export const SALE_DESTINATION_FARM_NAMESPACE = 'SALE_DESTINATION_FARM'

const saleDestinationFarmSelector = buildSaleDestinationFarmSelectionFlow({
  namespace: SALE_DESTINATION_FARM_NAMESPACE,
  flowType: FlowType.Selling,
  defaultBody: 'Qual e a fazenda de destino?',
})

function buildSaleDestinationFarmSelectionFlow(config: { namespace: string; flowType: FlowType; defaultBody: string }) {
  const flow = createSelectionFlow<{ id: string; name: string }>({
    namespace: config.namespace,
    type: 'selectFarm',
    fetchItems: async (userId) => {
      const farmsService = new (await import('../../services/farms/farms.service')).FarmsService()
      return farmsService.listFarms(userId)
    },
    ui: {
      header: 'Qual a fazenda de destino?',
      sectionTitle: 'Fazendas',
      buttonLabel: 'Ver opções',
    },
    defaultBody: config.defaultBody,
    invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
    emptyListMessage: 'Nao encontrei fazendas por aqui.',
    pageLimit: 10,
    titleBuilder: (farm, idx, base) => `${base + idx + 1}. ${farm.name}`,
    descriptionBuilder: () => 'Escolher',
    onSelected: async ({ userId, item }) => {
      await getUserContext(userId)
      await setUserContext(userId, {
        destinationFarmId: item.id,
        destinationFarmName: item.name,
      })

      if (getUserContextSync(userId)?.activeRegistration?.type === config.flowType) {
        try {
          await sellingService.updateDraftField(userId, 'destinationFarm', { id: item.id, name: item.name })
        } catch (error) {
          console.error(`[SaleDestinationFarmSelection] Falha ao atualizar o rascunho após a seleção`, error)
        }
      }

      await sendWhatsAppMessage(userId, getSelectionAck('generic', item.name))
      await tryContinueRegistration(userId)
    },
    onEditModeSelected: async ({ userId, item }) => {
      await saleFunctions.applySellingsRecordUpdates({
        phone: userId,
        updates: { destinationFarm: { id: item.id, name: item.name } },
        logContext: `Fazenda de destino atualizada para ${item.name}`,
      })
    },
  })

  const sendList = async (userId: string, bodyMsg = config.defaultBody, offset = 0) => {
    await flow.sendList(userId, bodyMsg, offset)
  }

  return { sendList }
}

export async function sendSaleDestinationFarmSelectionList(userId: string, bodyMsg = 'Qual e a fazenda de destino?', offset = 0) {
  await saleDestinationFarmSelector.sendList(userId, bodyMsg, offset)
}
