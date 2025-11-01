import express from 'express'
import { env } from './env.config'
import { WebhookService } from './services/webhook/webhookService'
const app = express()
app.use(express.json())
const webhookService = WebhookService.getInstance()

// Webhook routes
app.get('/webhook', webhookService.handleVerification)
app.post('/webhook', webhookService.webhookInitiator)

app.listen(env.PORT, () => {
  console.log(`✨ Servidor rodando na porta ${env.PORT}`)
})
