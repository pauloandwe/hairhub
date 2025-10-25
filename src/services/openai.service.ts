import OpenAI from 'openai'
import * as fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { env } from '../env.config'

export class OpenAiService {
  private openai: OpenAI

  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || env.OPENAI_API_KEY,
    })
  }

  /**
   * Transcribes a audio file with the OpenAi API (Whisper)
   * @param audioBuffer Audio file buffer
   * @param model Model to use in the OpenAi API (default: whisper-1)
   * @param language Language of the audio (default: pt)
   * @returns Transcribed text
   */
  async transcribe(audioBuffer: Buffer, model = 'whisper-1', language = 'pt'): Promise<string> {
    const tmpFilePath = await this.saveTempFile(audioBuffer)

    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpFilePath),
        model: model,
        language: language,
      })

      return transcription.text
    } catch (error) {
      console.error('Erro ao transcrever áudio com a API da OpenAI:', error)
      throw new Error('Falha ao transcrever o áudio.')
    } finally {
      await this.cleanupTempFile(tmpFilePath)
    }
  }

  private async saveTempFile(audioBuffer: Buffer): Promise<string> {
    const tmpDir = tmpdir()
    const filePath = path.join(tmpDir, `${randomUUID()}.ogg`)
    await fs.promises.writeFile(filePath, audioBuffer)
    return filePath
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath).catch(() => undefined)
  }

  async transcribeWithOptions(
    audioBuffer: Buffer,
    options: {
      model?: string
      language?: string
      prompt?: string
      temperature?: number
    } = {},
  ): Promise<string> {
    const tmpFilePath = await this.saveTempFile(audioBuffer)

    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpFilePath),
        model: options.model || 'whisper-1',
        language: options.language || 'pt',
        prompt: options.prompt,
        temperature: options.temperature,
      })

      return transcription.text
    } catch (error) {
      console.error('Erro ao transcrever áudio com a API da OpenAI:', error)
      throw new Error('Falha ao transcrever o áudio.')
    } finally {
      await this.cleanupTempFile(tmpFilePath)
    }
  }
}

export const openAiService = new OpenAiService()

export async function transcribeAudio(audioBuffer: Buffer, model = 'whisper-1'): Promise<string> {
  return openAiService.transcribe(audioBuffer, model)
}
