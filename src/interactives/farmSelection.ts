import { sendWhatsAppMessage } from '../api/meta.api'
import { FarmsService } from '../services/farms/farms.service'
import { UsersService } from '../services/users/users.service'
import { setUserContext } from '../env.config'
import { createSelectionFlow } from './flows'
import { clearAllUserIntents } from '../services/intent-history.service'

export const FARM_NAMESPACE = 'FARM'

const farmFlow = createSelectionFlow<{ id: string; name: string }>({
  namespace: FARM_NAMESPACE,
  type: 'selectFarm',
  fetchItems: async (userId) => {
    const farmsService = new FarmsService()
    return farmsService.listFarms(userId)
  },
  ui: {
    header: 'Escolha a Fazenda',
    sectionTitle: 'Fazendas',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Antes de continuar preciso que você selecione qual fazenda deseja consultar.',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhuma fazenda encontrada',
  pageLimit: 10,
  titleBuilder: (f, i, base) => `${base + i + 1}. ${f.name}`,
  descriptionBuilder: () => 'Selecione esta fazenda',
  onSelected: async ({ userId, item }) => {
    try {
      const usersService = new UsersService()
      await usersService.changeFarmAISettings(userId, item.id)
    } catch (e) {
      console.error('Falha ao persistir fazenda no UsersService', e)
    }
    // await setFarmIdForPhone(userId, item.id)
    try {
      if (item?.name) await setUserContext(userId, { farmName: item.name })
    } catch {}

    const text = `Fazenda '${item.name}' selecionada. Pode continuar sua pergunta.`
    await sendWhatsAppMessage(userId, text)
    clearAllUserIntents(userId)
  },
})

export async function sendFarmSelectionList(userId: string, farms?: { id: string; name: string }[], bodyMsg = 'Antes de continuar preciso que você selecione qual fazenda deseja consultar.', offset = 0) {
  await farmFlow.sendList(userId, bodyMsg, offset, farms)
}
