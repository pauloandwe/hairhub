import OpenAI from 'openai'

export type OpenAITool = OpenAI.ChatCompletionTool
export interface AIResponseResult {
  text: string
  suppress: boolean
}
