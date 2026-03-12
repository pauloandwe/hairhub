# Appointment State Cleanup Contract

Contrato de limpeza/preservação de estado para evitar reaproveitamento indevido entre interações de agendamento.

## Estados cobertos

- `activeRegistration`
- Draft de fluxo (`CHAT_DRAFT`)
- `pendingAppointmentOffer`
- `pendingAvailabilityResolution`
- `pendingAppointmentDateClarification`
- Histórico de intenção (`default` e por fluxo)

## Matriz por fase

| Fase                                                                       | activeRegistration                                                                            | CHAT_DRAFT                                                                | pendingOffer / pendingResolution                             | pendingDateClarification                                 | intent history                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| Início de novo agendamento (`startAppointmentRegistration` em modo `book`) | `collecting` com nova sessão                                                                  | Limpar draft `completed` e iniciar novo draft                             | Limpar                                                       | Preservar                                                | Limpar histórico da intenção ativa ao avançar etapa   |
| Confirmação concluída (registro criado)                                    | Marcar `status=completed`, `type=undefined`, manter `lastCreatedRecordId` para editar/excluir | Manter snapshot concluído para editar/excluir                             | Limpar quando novo fluxo `book` começar                      | Preservar                                                | Limpar histórico do fluxo                             |
| Cancelamento explícito do fluxo                                            | Reset para `FlowStep.Initial`                                                                 | Limpar                                                                    | Limpar quando novo fluxo `book` começar                      | Preservar                                                | Limpar histórico do fluxo                             |
| Pós-consulta (ex.: `check_then_offer`, pergunta de disponibilidade)        | Reset para `FlowStep.Initial`                                                                 | Não criar dependência de draft antigo                                     | Preservar até aceitar/recusar/expirar                        | Preservar até resolver/expirar                           | Limpar `default` após resposta da tool                |
| Pós-erro de criação/edição                                                 | Sessão deve ser resetável sem reaproveitar draft concluído indevido                           | Não reutilizar draft `completed` em nova sessão sem confirmação explícita | Preservar apenas se ainda forem válidos no contexto pendente | Preservar apenas se ainda estiver aguardando complemento | Limpar histórico da intenção quando falha for tratada |

## Invariantes obrigatórias

- Draft com `status=completed` nunca pode ser reaproveitado automaticamente para um novo agendamento quando `activeRegistration.status` estiver ausente.
- Mensagens novas não podem ser interceptadas por pendências expiradas (`offer`, `resolution`, `date clarification`).
- Reset de sessão padrão deve ser determinístico (`await`) antes de prosseguir.

## Cobertura automatizada relacionada

- `src/functions/generic/generic.flow.test.ts`
- `src/services/defaultContext.test.ts`
- `src/services/appointments/appointment-intent.service.test.ts`
- `src/services/context/contextService.test.ts`
