import express from 'express'
import { env } from './env.config'
import { WebhookService } from './services/webhook/webhookService'
import { reminderRouter } from './services/reminders/reminder-handler.service'
const app = express()
app.use(express.json())
const webhookService = WebhookService.getInstance()

// Webhook routes
app.get('/webhook', webhookService.handleVerification)
app.post('/webhook', webhookService.webhookInitiator)

// Reminder routes
app.use(reminderRouter)

// Health check geral
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'barber-hub-whatsapp',
    timestamp: new Date().toISOString(),
  })
})

app.listen(env.PORT, () => {
  console.log(`✨ Servidor rodando na porta ${env.PORT}`)
})
