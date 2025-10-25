import OpenAI from 'openai'

export const summarize = (m: OpenAI.Chat.Completions.ChatCompletionMessageParam) => {
  const anyMsg: any = m
  const content = anyMsg?.content
  return {
    role: m.role,
    content: typeof content === 'string' ? content.slice(0, 800) : content,
  }
}
