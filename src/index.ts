import express from 'express'
import { setApiBearerToken } from './config/api.config'
import { env } from './env.config'
import { WebhookService } from './services/webhook/webhookService'
import { seedMockData } from './seeds'

const app = express()
app.use(express.json())
const webhookService = WebhookService.getInstance()
// setApiBearerToken(env.BEARER_TOKEN)

app.get('/webhook', webhookService.handleVerification)
app.post('/webhook', webhookService.webhookInitiator)

async function startup() {
  console.log('🚀 Iniciando BarberHub...')

  // Seed mock data
  try {
    await seedMockData()
  } catch (error) {
    console.error('❌ Erro ao popular dados mock:', error)
  }

  // Start server
  app.listen(env.PORT, () => {
    console.log(`✅ Servidor rodando na porta ${env.PORT}`)
    console.log(`🤖 BarberBot está pronto para atender!`)
  })
}

startup().catch(console.error)
