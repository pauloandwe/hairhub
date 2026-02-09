import express from 'express'
import { env } from './env.config'
import { WebhookService } from './services/webhook/webhookService'
import { reminderRouter } from './services/reminders/reminder-handler.service'
import { outreachRouter } from './services/outreach/outreach-handler.service'
const app = express()
app.use(express.json())
const webhookService = WebhookService.getInstance()

app.get('/webhook', webhookService.handleVerification)
app.post('/webhook', webhookService.webhookInitiator)

app.use(reminderRouter)
app.use(outreachRouter)

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'professional-hub-whatsapp',
    timestamp: new Date().toISOString(),
  })
})

app.listen(env.PORT, () => {
  console.log(`✨ Servidor rodando na porta ${env.PORT}`)
})
