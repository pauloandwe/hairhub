# Appointment State Manual Checklist

Checklist manual para homologação em WhatsApp real com foco em limpeza de estado entre interações.

## Pré-condições
- Ambiente com `businessTimezone=America/Sao_Paulo`.
- Usuário de teste sem bloqueios de plano.
- Histórico de conversa prévio disponível para validar não reaproveitamento indevido.

## Cenários

1. Consulta ampla -> pedido de marcação só com horário
- Mensagem 1: "quais horários disponíveis para amanhã?"
- Mensagem 2: "quero marcar às 17"
- Esperado: bot deve solicitar serviço (não assumir serviço anterior).

2. Marcação com serviço explícito
- Mensagem: "quero marcar corte amanhã às 17"
- Esperado: bot não deve pedir serviço novamente.

3. Marcação com profissional explícito e sem serviço
- Mensagem: "quero marcar amanhã às 17 com João"
- Esperado: bot deve solicitar serviço antes da confirmação final.

4. Oferta pendente (check_then_offer) com recusa
- Mensagem 1: "tem horário amanhã às 17?"
- Mensagem 2: "agora não"
- Esperado: estado de oferta pendente deve ser limpo; próxima mensagem não pode continuar oferta antiga.

5. Resolução pendente (desambiguação) com troca de assunto
- Mensagem 1: gerar desambiguação de serviço/profissional
- Mensagem 2: "qual endereço?"
- Esperado: bot deve pedir esclarecimento da pendência, sem confirmar nada automaticamente.

6. Expiração de pendência
- Criar pendência (`offer`, `resolution` ou `date clarification`) e aguardar TTL expirar.
- Enviar nova mensagem fora do contexto anterior.
- Esperado: pendência expirada não deve interceptar a nova intenção.

7. Pós-confirmação com novo agendamento
- Confirmar um agendamento completo.
- Iniciar novo agendamento com mensagem sem serviço.
- Esperado: novo fluxo começa limpo, sem reaproveitar serviço/profissional antigos.

8. Pós-cancelamento com novo agendamento
- Iniciar fluxo e cancelar explicitamente.
- Iniciar novo fluxo com mensagem sem serviço.
- Esperado: novo fluxo inicia limpo.

9. Pós-erro de criação/edição
- Forçar erro de criação/edição (ex.: conflito de horário).
- Enviar nova mensagem de agendamento.
- Esperado: nenhum estado pendente antigo deve sequestrar a nova conversa.

10. Pós-confirmação: editar/excluir ainda funcional
- Confirmar agendamento.
- Usar botões "Editar" e "Cancelar horário".
- Esperado: ações continuam disponíveis e funcionais.

## Critérios de aprovação
- Nenhum reaproveitamento automático de serviço/profissional entre interações finalizadas.
- Nenhuma interceptação por pendência expirada.
- Fluxos de editar/excluir pós-confirmação continuam íntegros.
