import type { FlowMessages } from '../functions/generic/generic.flow'

type InteractiveCopyKind =
  | 'chooseOption'
  | 'expiredOption'
  | 'loadError'
  | 'whatNext'
  | 'confirmAction'
  | 'confirmActionShort'
  | 'notAvailable'
  | 'retryEmptyList'
  | 'retryExpired'

type SelectionAckKind =
  | 'generic'
  | 'service'
  | 'professional'
  | 'date'
  | 'time'
  | 'appointment'
  | 'newDate'
  | 'newTime'
  | 'location'
  | 'category'

export function createHumanFlowMessages(overrides: Partial<FlowMessages> = {}): FlowMessages {
  return {
    confirmation: 'Se estiver tudo certo, posso confirmar assim?',
    creationSuccess: 'Pronto, ficou tudo certo por aqui.',
    creationResponse: 'Perfeito, já deixei isso certo por aqui.',
    cancelSent: 'Sem problema, parei por aqui.',
    cancelResponse: 'Tudo bem, cancelei esse fluxo.',
    missingDataDuringConfirm: 'Ainda falta um pedacinho. Vou te pedir o que falta.',
    invalidField: 'Esse item eu nao consigo trocar por aqui. Me fala o que voce quer mudar que eu te ajudo.',
    editModeIntro: 'Beleza, me diz o que voce quer ajustar.',
    editModeExamples: ['"Mudar a data"', '"Trocar o horario"', '"Corrigir essa informacao"'],
    editRecordNotFound: 'Nao consegui localizar esse registro por aqui.',
    editFieldUpdateError: 'Nao consegui atualizar isso agora.',
    editPromptFallback: 'Me fala qual valor voce quer colocar.',
    editDirectChangeSuccess: 'Perfeito, anotei essa mudanca.',
    editUpdateSuccess: 'Pronto, atualizei isso para voce.',
    editUpdateError: 'Nao consegui atualizar isso agora. Tenta mais uma vez?',
    deleteRecordNotFound: 'Nao achei esse registro para continuar.',
    deleteSuccess: 'Pronto, isso foi removido.',
    deleteError: 'Nao consegui fazer isso agora. Tenta de novo daqui a pouco?',
    buttonHeaderSuccess: 'Tudo certo',
    buttonHeaderEdit: 'Vamos ajustar',
    useNaturalLanguage: false,
    ...overrides,
  }
}

export function getInteractiveCopy(kind: InteractiveCopyKind, context?: { attempts?: number; maxRetries?: number }): string {
  switch (kind) {
    case 'chooseOption':
      return 'Me diz qual opcao voce quer.'
    case 'expiredOption':
      return 'Essa opcao ja expirou. Vou te mandar de novo.'
    case 'loadError':
      return 'Nao consegui carregar isso agora. Tenta mais uma vez daqui a pouco.'
    case 'whatNext':
      return 'O que voce quer fazer agora?'
    case 'confirmAction':
      return 'Se estiver tudo certo, posso confirmar.'
    case 'confirmActionShort':
      return 'Posso seguir com isso?'
    case 'notAvailable':
      return 'Essa opcao nao esta disponivel agora.'
    case 'retryEmptyList':
      return 'Nao achei opcao disponivel agora. Quer que eu tente de novo ou prefere parar por aqui?'
    case 'retryExpired': {
      const attempts = context?.attempts ?? 1
      const maxRetries = context?.maxRetries ?? 3
      return `Essa opcao expirou. Vou te mandar de novo (${attempts}/${maxRetries}).`
    }
    default:
      return 'Me diz como voce quer seguir.'
  }
}

export function getSelectionAck(kind: SelectionAckKind, label?: string): string {
  switch (kind) {
    case 'service':
      return label ? `Perfeito, anotei o servico "${label}".` : 'Perfeito, anotei o servico.'
    case 'professional':
      return label ? `Perfeito, separei com ${label}.` : 'Perfeito, anotei sua preferencia.'
    case 'date':
      return label ? `Perfeito, fiquei com ${label}.` : 'Perfeito, anotei essa data.'
    case 'newDate':
      return label ? `Boa, vamos com ${label}.` : 'Boa, anotei a nova data.'
    case 'time':
      return label ? `Perfeito, peguei o horario ${label} para voce.` : 'Perfeito, peguei esse horario para voce.'
    case 'newTime':
      return label ? `Perfeito, deixei o novo horario ${label} separado.` : 'Perfeito, anotei o novo horario.'
    case 'appointment':
      return label ? `Perfeito, vamos seguir com ${label}.` : 'Perfeito, encontrei esse agendamento.'
    case 'location':
      return label ? `Certo, vou considerar ${label}.` : 'Certo, anotei essa localizacao.'
    case 'category':
      return label ? `Perfeito, fiquei com ${label}.` : 'Perfeito, anotei essa categoria.'
    default:
      return label ? `Perfeito, anotei "${label}".` : 'Perfeito, anotei isso.'
  }
}

export function getMenuSentCopy(subject: string): string {
  return `Te mandei as opcoes de ${subject}.`
}
