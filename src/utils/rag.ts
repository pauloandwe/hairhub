import fs from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'

export type RagItem = { id: number; text: string; embedding: number[] }

let RAG_INDEX: RagItem[] = []
let OPENAI_CLIENT: OpenAI

export async function initRag(openai: OpenAI, file = 'pdf_contexts/rag-index.json') {
  const p = path.resolve(process.cwd(), file)
  const raw = await fs.readFile(p, 'utf8')
  RAG_INDEX = JSON.parse(raw)
  OPENAI_CLIENT = openai
}

function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export async function retrieveContext(query: string, k = 4) {
  if (!OPENAI_CLIENT || RAG_INDEX.length === 0) return { context: '', sources: [] as RagItem[] }

  const response = await OPENAI_CLIENT.embeddings.create({
    model: 'text-embedding-ada-002',
    input: query,
  })
  const q = response.data[0].embedding

  const scored = RAG_INDEX.map((it) => ({
    item: it,
    score: cosine(q, it.embedding),
  }))
  scored.sort((a, b) => b.score - a.score)

  const top = scored.slice(0, k).map((s) => s.item)
  const context = top.map((t, i) => `[#${i + 1}] ${t.text}`).join('\n\n')
  return { context, sources: top }
}
