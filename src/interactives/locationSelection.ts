import { sendWhatsAppMessage } from '../api/meta.api'
import { FlowType } from '../enums/generic.enum'
import { AnimalLotOption, AnimalLotSelectionService } from '../services/livestocks/animal-lot.service'
import { birthService } from '../services/livestocks/Birth/birthService'
import { updateDraftWithAnimalLotSelection } from '../services/livestocks/death-draft.service'
import { getBusinessIdForPhone, getUserContext, setUserContext, getUserContextSync } from '../env.config'
import { createSelectionFlow } from './flows'
import { tryContinueRegistration } from './followup'
import { deathFunctions } from '../functions/livestocks/death/death.functions'
import { birthFunctions } from '../functions/livestocks/birth/birth.functions'
import { DeathField } from '../enums/cruds/deathFields.enums'
import { BirthField } from '../enums/cruds/birthFields.enum'
import { UpsertBirthArgs } from '../services/livestocks/Birth/birth.types'
import { UpsertArgs as DeathUpsertArgs } from '../services/livestocks/death-draft.service'

type LocationSelectionConfig = {
  namespace: string
  flowType: FlowType
  defaultBody: string
  emptyListMessage?: string
  successMessageBuilder?: (item: AnimalLotOption) => string
  applySelection?: (userId: string, item: AnimalLotOption) => Promise<void>
  applyEditModeSelection?: (userId: string, item: AnimalLotOption) => Promise<void>
}

type LocationSelector = {
  sendList: (userId: string, bodyMsg?: string, offset?: number) => Promise<void>
}

const DEFAULT_HEADER = 'Qual a localização?'
const DEFAULT_SECTION_TITLE = 'Localizações'
const DEFAULT_SUCCESS_PATH = (item: AnimalLotOption) => (item.lotName ? `${item.retreatName} -> ${item.areaName} -> ${item.lotName}` : `${item.retreatName} -> ${item.areaName}`)

const buildBaseSelectionFlow = (config: LocationSelectionConfig): LocationSelector => {
  const flow = createSelectionFlow<AnimalLotOption>({
    namespace: config.namespace,
    type: 'selectLocation',
    fetchItems: async (userId) => {
      const service = new AnimalLotSelectionService()
      const farmId = getBusinessIdForPhone(userId)
      return service.listAnimalLots(farmId)
    },
    ui: {
      header: DEFAULT_HEADER,
      sectionTitle: DEFAULT_SECTION_TITLE,
      footer: 'Inttegra Assistente',
      buttonLabel: 'Ver opções',
    },
    defaultBody: config.defaultBody,
    invalidSelectionMsg: 'Opa, essa opção expirou',
    emptyListMessage: config.emptyListMessage,
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

      if (getUserContextSync(userId)?.activeRegistration?.type === config.flowType && config.applySelection) {
        try {
          await config.applySelection(userId, item)
        } catch (error) {
          console.error(`[LocationSelection:${config.flowType}] Falha ao atualizar o rascunho após a seleção`, error)
        }
      }

      const path = config.successMessageBuilder ? config.successMessageBuilder(item) : DEFAULT_SUCCESS_PATH(item)
      await sendWhatsAppMessage(userId, `Beleza! Localização marcada: ${path}`)
      await tryContinueRegistration(userId)
    },
    onEditModeSelected: async ({ userId, item }) => {
      if (config.applyEditModeSelection) {
        await config.applyEditModeSelection(userId, item)
      }
    },
  })

  const sendList = async (userId: string, bodyMsg = config.defaultBody, offset = 0) => {
    await flow.sendList(userId, bodyMsg, offset)
  }

  return { sendList }
}

export const LOCATION_NAMESPACE = 'LOCATION'
export const BIRTH_LOCATION_NAMESPACE = 'BIRTH_LOCATION'

const deathLocationSelector = buildBaseSelectionFlow({
  namespace: LOCATION_NAMESPACE,
  flowType: FlowType.Death,
  defaultBody: 'Bora escolher a localização (Retiro → Área → Lote) 👇',
  emptyListMessage: 'Nenhuma localização encontrada',
  successMessageBuilder: DEFAULT_SUCCESS_PATH,
  applySelection: async (userId, item) => {
    await updateDraftWithAnimalLotSelection(userId, {
      lotId: item.lotId || undefined,
      lotName: item.lotName || undefined,
      retreatId: item.retreatId,
      retreatName: item.retreatName,
      areaId: item.areaId,
      areaName: item.areaName,
    })
  },
  applyEditModeSelection: async (userId, item) => {
    const updates: Partial<DeathUpsertArgs> = {
      [DeathField.Retreat]: { id: item.retreatId, name: item.retreatName },
      [DeathField.Area]: { id: item.areaId, name: item.areaName },
    }
    if (item.lotId) {
      updates[DeathField.AnimalLot] = { id: item.lotId, name: item.lotName }
    }
    await deathFunctions.applyDeathRecordUpdates({
      phone: userId,
      updates,
      logContext: `Localização atualizada para ${DEFAULT_SUCCESS_PATH(item)}`,
    })
  },
})

const birthLocationSelector = buildBaseSelectionFlow({
  namespace: BIRTH_LOCATION_NAMESPACE,
  flowType: FlowType.Birth,
  defaultBody: 'Bora escolher a localização (Retiro → Área) 👇',
  emptyListMessage: 'Nenhuma localização encontrada',
  successMessageBuilder: (item) => `${item.retreatName} -> ${item.areaName}`,
  applySelection: async (userId, item) => {
    await birthService.updateDraft(userId, {
      area: { id: item.areaId, name: item.areaName },
      retreat: { id: item.retreatId, name: item.retreatName },
    })
  },
  applyEditModeSelection: async (userId, item) => {
    const updates: Partial<UpsertBirthArgs> = {
      [BirthField.Retreat]: { id: item.retreatId, name: item.retreatName },
      [BirthField.Area]: { id: item.areaId, name: item.areaName },
    }
    await birthFunctions.applyBirthRecordUpdates({
      phone: userId,
      updates,
      logContext: `Localização atualizada para ${item.retreatName} -> ${item.areaName}`,
    })
  },
})

export async function sendLocationSelectionList(userId: string, bodyMsg = 'Bora escolher a localização (Retiro → Área → Lote) 👇', offset = 0) {
  await deathLocationSelector.sendList(userId, bodyMsg, offset)
}

export async function sendBirthLocationSelectionList(userId: string, bodyMsg = 'Bora escolher a localização (Retiro → Área) 👇', offset = 0) {
  await birthLocationSelector.sendList(userId, bodyMsg, offset)
}
