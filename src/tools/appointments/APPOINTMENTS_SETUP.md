# Configuração da Tool de Agendamentos no Hairhub

## Visão Geral

A tool `getAppointmentHistory` permite que o usuário consulte seus agendamentos através do WhatsApp. Ela integra a IA do Hairhub com a rota de backend que busca agendamentos por número de telefone.

## Fluxo de Funcionamento

```
Usuário no WhatsApp
    ↓
"Quais agendamentos eu tenho?"
    ↓
DefaultContextService detecta intenção
    ↓
Chama tool: getAppointmentHistory
    ↓
appointment-queries.functions.ts
    ↓
API Backend: GET /appointments/:businessId/appointments/phone/:phoneNumber
    ↓
Retorna agendamentos do cliente
    ↓
LLM formata resposta amigável
    ↓
Usuário recebe mensagem em PT-BR
```

## Implementação

### 1. Tool Definition (`appointment-queries.tools.ts`)

Define como a tool aparece ao OpenAI:

```typescript
{
  type: 'function',
  function: {
    name: 'getAppointmentHistory',
    description: 'Retorna o histórico de agendamentos do cliente...',
    parameters: {
      type: 'object',
      properties: {
        clientPhone: { type: 'string', description: 'Telefone do cliente (opcional)' },
        limit: { type: 'integer', description: 'Número máximo de registros a retornar (padrão: 10)' },
      },
      required: [],
    },
  },
}
```

### 2. Function Implementation (`appointment-queries.functions.ts`)

Implementa a lógica da função:

```typescript
getAppointmentHistory: async (args: { phone: string; clientPhone?: string; limit?: number }) => {
  // 1. Obtém businessId do telefone
  const businessId = getBusinessIdForPhone(phone)

  // 2. Define qual telefone usar para buscar
  const phoneToSearch = clientPhone || phone

  // 3. Chama a API do backend
  const response = await fetch(
    `${apiUrl}/appointments/${businessId}/appointments/phone/${phoneToSearch}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )

  // 4. Formata resposta para padrão do Hairhub
  // 5. Retorna dados estruturados
}
```

### 3. Context Registration (`defaultContext.ts`)

Registra a tool e a função no contexto:

```typescript
import { appointmentQueryTools } from '../tools/appointments/appointment-queries.tools'
import { appointmentQueryFunctions } from '../functions/appointments/appointment-queries.functions'

private contextTools = [
  ...appointmentQueryTools,  // ← Adiciona as tools ao contexto
  ...unsupportedRegistrationTools,
  ...unsupportedQueryTools,
]

private serviceFunctions = {
  ...appointmentQueryFunctions,  // ← Registra as funções
  startAppointmentRegistration: appointmentFunctions.startAppointmentRegistration,
}
```

## Variáveis de Ambiente Necessárias

No arquivo `.env` do Hairhub:

```env
# Backend API Configuration
BACKEND_API_URL=http://localhost:3001
BACKEND_API_TOKEN=seu_token_jwt_aqui_opcional
```

## Exemplos de Uso

### Exemplo 1: Usuário pergunta seus agendamentos

```
Usuário: "Quais agendamentos eu tenho?"

OpenAI interpreta → Chama getAppointmentHistory({ phone: '5511987654321' })

Retorna:
{
  status: 'success',
  data: {
    appointments: [
      {
        id: '1',
        date: '31/10/2024',
        time: '14:00',
        service: 'Corte Masculino',
        barber: 'João',
        status: 'confirmed',
        notes: '',
        duration: 30
      }
    ],
    total: 1,
    message: 'Você tem 1 agendamento(s).'
  }
}

LLM formata → "📅 Você tem 1 agendamento:\n\n1. Corte Masculino\n   31/10/2024 às 14:00\n   Barbeiro: João"
```

### Exemplo 2: Com limite de registros

```
Usuário: "Me mostra meus últimos 5 agendamentos"

OpenAI interpreta → getAppointmentHistory({ phone: '5511987654321', limit: 5 })

Retorna até 5 agendamentos formatados
```

## Dados Retornados

A função retorna um objeto estruturado:

```typescript
{
  status: 'success' | 'error',
  data?: {
    appointments: Array<{
      id: string,
      date: string,        // Formato: "31/10/2024"
      time: string,        // Formato: "14:00"
      service: string,     // Nome do serviço
      barber: string,      // Nome do barbeiro
      status: string,      // 'pending' | 'confirmed' | 'canceled'
      notes: string,       // Observações do agendamento
      duration: number,    // Duração em minutos
    }>,
    total: number,        // Total de agendamentos encontrados
    message: string,      // Mensagem contextual
  },
  error?: string,         // Mensagem de erro, se houver
}
```

## Backend Integration

A tool se integra com a rota criada no backend:

```
GET /appointments/:businessId/appointments/phone/:phoneNumber
Authorization: Bearer {token}
```

**Response exemplo:**
```json
[
  {
    "id": 1,
    "businessId": 1,
    "serviceId": 1,
    "barberId": 1,
    "clientContactId": 1,
    "startDate": "2024-10-31T14:00:00Z",
    "endDate": "2024-10-31T14:30:00Z",
    "status": "confirmed",
    "source": "whatsapp",
    "notes": "Cliente preferiu segunda-feira",
    "service": { "id": 1, "name": "Corte Masculino", "duration": 30 },
    "barber": { "id": 1, "name": "João" },
    "clientContact": { "id": 1, "name": "Pedro", "phone": "5511987654321" }
  }
]
```

## Tratamento de Erros

A função trata diversos cenários:

1. **businessId não encontrado**
   ```
   Erro: "Não consegui identificar sua barbearia. Tenta de novo mais tarde."
   ```

2. **Telefone não informado**
   ```
   Erro: "Número de telefone não informado."
   ```

3. **API retorna erro**
   ```
   Erro: "Não consegui buscar seus agendamentos. Tenta de novo mais tarde."
   ```

4. **Nenhum agendamento encontrado**
   ```
   Sucesso com mensagem: "Você não tem agendamentos registrados."
   ```

## Logs

A função registra eventos importantes em logs:

```
[INFO] Consultando histórico de agendamentos
[INFO] Agendamentos recuperados com sucesso (count: 3, phone: 5511987654321, businessId: 1)
[ERROR] Erro ao buscar agendamentos na API (status: 401, phone: 5511987654321)
```

## Fluxo Completo de Exemplo

1. **Usuário envia mensagem WhatsApp**
   ```
   "Qual foi meu último corte?"
   ```

2. **DefaultContextService processa**
   - Extrai phone do usuário: `5511987654321`
   - Constrói prompt para OpenAI
   - OpenAI identifica intenção: buscar histórico

3. **OpenAI chama a tool**
   ```
   function_name: "getAppointmentHistory"
   arguments: { "clientPhone": "5511987654321", "limit": 10 }
   ```

4. **Função executa**
   - Busca businessId via `getBusinessIdForPhone()`
   - Chama API backend: `/appointments/1/appointments/phone/5511987654321`
   - Formata resposta em PT-BR

5. **OpenAI processa resultado**
   - Recebe dados estruturados
   - Cria resposta amigável
   - Enriquece com emojis e formatação

6. **Resposta enviada ao usuário**
   ```
   "📅 Seu último corte foi:

   Corte Masculino
   📅 20/10/2024 às 14:00
   👨‍💼 Barbeiro: João
   ✅ Status: Realizado"
   ```

## Debugging

Para debugar a função, adicione logs:

```typescript
logger.info({ businessId, phoneToSearch }, 'Iniciando busca de agendamentos')
logger.debug({ apiUrl, phone }, 'Chamando API do backend')
logger.info({ count: appointments.length }, 'Agendamentos processados')
```

## Próximas Melhorias

- [ ] Adicionar filtro por status (apenas futuros/pendentes)
- [ ] Adicionar filtro por data (últimos 30 dias)
- [ ] Adicionar opção de reagendar direto
- [ ] Integrar com calendário visual
- [ ] Notificações de agendamentos próximos

## Referências

- **API Backend**: `/appointments/:businessId/appointments/phone/:phoneNumber`
- **Tool Definition**: `hairhub/src/tools/appointments/appointment-queries.tools.ts`
- **Implementation**: `hairhub/src/functions/appointments/appointment-queries.functions.ts`
- **Context**: `hairhub/src/services/defaultContext.ts`
