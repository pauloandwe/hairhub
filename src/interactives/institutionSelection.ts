import { sendWhatsAppMessage } from '../api/meta.api'
import { InstitutionService } from '../services/users/institution.service'
import { UsersService } from '../services/users/users.service'
import { setUserContext } from '../env.config'
import { sendFarmSelectionList } from './farmSelection'
import { createSelectionFlow } from './flows'

export const INSTITUTION_NAMESPACE = 'INSTITUTION'

const institutionFlow = createSelectionFlow<{ id: string; name: string }>({
  namespace: INSTITUTION_NAMESPACE,
  type: 'selectInstitution',
  fetchItems: async (userId) => {
    const service = new InstitutionService()
    const institutions = await service.listInstitutions(userId)
    return institutions.map((i) => ({ id: String(i.id), name: i.name }))
  },
  ui: {
    header: 'Escolha a Instituição',
    sectionTitle: 'Instituições',
    footer: 'Inttegra Assistente',
    buttonLabel: 'Ver opções',
  },
  defaultBody: 'Antes de continuar preciso que você selecione qual instituição deseja consultar.',
  invalidSelectionMsg: 'Seleção inválida ou expirada. Reenviando a lista.',
  emptyListMessage: 'Nenhuma instituição encontrada',
  pageLimit: 10,
  titleBuilder: (i, idx, base) => `${base + idx + 1}. ${i.name}`,
  descriptionBuilder: () => 'Selecione esta instituição',
  onSelected: async ({ userId, item }) => {
    try {
      const usersService = new UsersService()
      await usersService.changeInstitutionAISettings(userId, String(item.id))
    } catch (e) {
      console.error('Falha ao persistir instituição no UsersService', e)
    }

    await setUserContext(userId, { farmId: '', farmName: '' })

    await sendWhatsAppMessage(userId, `Instituição '${item.name}' selecionada. Agora selecione a fazenda.`)

    await sendFarmSelectionList(userId)
  },
})

export async function sendInstitutionSelectionList(userId: string, institutions?: { id: string | number; name: string }[], bodyMsg = 'Antes de continuar preciso que você selecione qual instituição deseja consultar.', offset = 0) {
  const normalized = (institutions || []).map((i) => ({
    id: String(i.id),
    name: i.name,
  }))
  await institutionFlow.sendList(userId, bodyMsg, offset, institutions ? normalized : undefined)
}
