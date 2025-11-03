# BarberHub 💈

Sistema de agendamentos inteligente para barbearias via WhatsApp com IA conversacional.

## 🎯 Funcionalidades

- ✅ **Agendamentos via conversa natural** - Cliente conversa naturalmente e a IA guia o processo
- 🔍 **Consultas de agendamentos** - "Quando é meu horário?", "Meus agendamentos"
- 📅 **Verificação de disponibilidade** - Mostra horários disponíveis em tempo real
- 🤖 **IA conversacional** - Entende linguagem natural e contexto
- 🏢 **Multi-tenant** - Suporta múltiplas barbearias em uma única instância
- 📱 **WhatsApp Business API** - Integração nativa com WhatsApp

## 🚀 Tecnologias

- **Node.js** + **TypeScript**
- **Express** - Framework web
- **OpenAI GPT-4** - IA conversacional
- **Redis** - Cache e storage (opcional)
- **WhatsApp Business API** (Meta) - Mensageria

## 📋 Pré-requisitos

- Node.js 18+
- Redis (opcional para desenvolvimento, usa fallback em memória)
- Conta WhatsApp Business API (Meta)
- Chave API da OpenAI

## ⚙️ Instalação

### 1. Clonar repositório

```bash
git clone <repo-url>
cd hairhub
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# WhatsApp Business (Meta)
META_VERIFY_TOKEN=seu_token_verify
META_ACCESS_TOKEN=seu_access_token_meta
PHONE_NUMBER_ID=seu_phone_id

# Redis (opcional)
REDIS_URL=redis://localhost:6379

# Cache TTLs (segundos)
REDIS_DRAFT_TTL_SEC=500
REDIS_CHAT_HISTORY_TTL_SEC=300
REDIS_INTENT_HISTORY_TTL_SEC=3600
REDIS_USER_CONTEXT_TTL_SEC=3600

# Whisper (transcrição de áudio)
WHISPER_MODEL=base
WHISPER_COMMAND=whisper

# Servidor
PORT=3000

# Bearer Token (autenticação interna)
BEARER_TOKEN=seu_bearer_token
```

### 4. Build

```bash
npm run build
```

### 5. Executar

```bash
npm start
```

Ou em modo desenvolvimento:

```bash
npm run dev
```

## 📁 Estrutura do Projeto

```
hairhub/
├── src/
│   ├── api/                    # APIs mock (business, appointments)
│   ├── enums/                  # Enumerações
│   ├── functions/              # Funções de negócio
│   │   ├── appointments/       # Fluxos de agendamento
│   │   └── utils/              # Funções utilitárias
│   ├── seeds/                  # Dados de exemplo (mock)
│   ├── services/               # Camada de serviços
│   │   ├── appointments/       # Serviços de agendamento
│   │   ├── drafts/             # Gerenciamento de drafts
│   │   └── webhook/            # Webhook WhatsApp
│   ├── tools/                  # Definições de ferramentas OpenAI
│   ├── types/                  # TypeScript types
│   ├── utils/                  # Utilitários (validadores, formatadores)
│   ├── env.config.ts           # Configuração de ambiente
│   └── index.ts                # Entry point
└── dist/                       # Build output
```

## 🎭 Como Funciona

### Fluxo de Agendamento

1. **Cliente:** "Quero marcar um horário"
2. **BarberBot:** Mostra lista de serviços
3. **Cliente:** "Corte completo"
4. **BarberBot:** Mostra lista de barbeiros
5. **Cliente:** "João"
6. **BarberBot:** Pede a data
7. **Cliente:** "Sábado"
8. **BarberBot:** Mostra horários disponíveis
9. **Cliente:** "14h"
10. **BarberBot:** Mostra resumo e pede confirmação
11. **Cliente:** "Sim"
12. **BarberBot:** ✅ Agendamento confirmado!

### Multi-Tenant

O sistema identifica qual business através do número de WhatsApp. Cada número pode ser configurado com:

- Serviços oferecidos
- Barbeiros disponíveis
- Horários de funcionamento
- Configurações específicas

## 🧪 Dados de Exemplo

O sistema vem com 2 barbearias de exemplo:

**Business Alpha** (5511999999999)

- 3 barbeiros
- 5 serviços
- Seg-Sex 9h-18h, Sáb 9h-14h

**Business Beta** (5511888888888)

- 2 barbeiros
- 4 serviços
- Ter-Sáb 10h-19h

## 🔧 API Endpoints

### Webhook WhatsApp

```
GET  /webhook         - Verificação (Meta webhook challenge)
POST /webhook         - Receber mensagens
```

## 🛠️ Desenvolvimento

### Comandos disponíveis

```bash
npm run dev          # Desenvolvimento com hot-reload
npm run build        # Build TypeScript
npm start            # Executar build
npm run lint         # Lint código
```

## 📝 Próximos Passos

Funcionalidades a implementar:

- [ ] Remarcação de agendamentos
- [ ] Cancelamento de agendamentos
- [ ] Sistema de lembretes automáticos (24h e 2h antes)
- [ ] Integração com backend real (substituir mock)
- [ ] Histórico de agendamentos
- [ ] Notificações para barbeiros
- [ ] Dashboard administrativo

## 📄 Licença

ISC
