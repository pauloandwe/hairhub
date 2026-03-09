import { sendWhatsAppMessage } from '../api/meta.api'
import { FarmsService } from '../services/farms/farms.service'
import { UsersService } from '../services/users/users.service'
import { setUserContext } from '../env.config'
import { createSelectionFlow } from './flows'
import { clearAllUserIntents } from '../services/intent-history.service'
import { FarmSelectionError } from '../services/farms/farm.errors'
import { getSelectionAck } from '../utils/conversation-copy'

export const FARM_NAMESPACE = 'FARM'

const farmFlow = createSelectionFlow<{ id: string; name: string }>({
  namespace: FARM_NAMESPACE,
  type: 'selectFarm',
  fetchItems: async (userId) => {
    const farmsService = new FarmsService()
    return farmsService.listFarms(userId)
  },
  ui: {
    header: 'Escolha a fazenda',
    sectionTitle: 'Fazendas',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Antes de continuar, me fala qual fazenda voce quer consultar.',
  invalidSelectionMsg: 'Essa opcao nao vale mais. Vou te mandar a lista de novo.',
  emptyListMessage: 'Nao encontrei fazendas por aqui.',
  pageLimit: 10,
  titleBuilder: (f, i, base) => `${base + i + 1}. ${f.name}`,
  descriptionBuilder: () => 'Escolher essa fazenda',
  onSelected: async ({ userId, item }) => {
    try {
      const usersService = new UsersService()
      await usersService.changeFarmAISettings(userId, item.id)
    } catch (e) {
      console.error('Falha ao persistir fazenda no UsersService', e)
    }
    try {
      if (item?.name) await setUserContext(userId, { farmName: item.name })
    } catch {}

    const text = `${getSelectionAck('generic', item.name)} Pode continuar.`
    await sendWhatsAppMessage(userId, text)
    clearAllUserIntents(userId)
  },
  onError: async ({ userId, error }) => {
    if (error instanceof FarmSelectionError) {
      const { sendInstitutionSelectionList } = await import('./institutionSelection')
      const message = error.code === 'MISSING_INSTITUTION' ? 'Nao encontrei a instituicao selecionada. Vamos escolher de novo?' : 'Tive um problema para listar as fazendas. Vamos escolher a instituicao mais uma vez?'
      await sendWhatsAppMessage(userId, message)
      await sendInstitutionSelectionList(userId)
      return true
    }
    return false
  },
})

export async function sendFarmSelectionList(userId: string, farms?: { id: string; name: string }[], bodyMsg = 'Antes de continuar, me fala qual fazenda voce quer consultar.', offset = 0) {
  await farmFlow.sendList(userId, bodyMsg, offset, farms)
}
