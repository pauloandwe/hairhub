import { OpenAITool } from '../../types/openai-types'

export const weatherTools: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'getWeatherAmountAccumulated',
      description:
        "Retorna a precipitação acumulada (mm) para UMA safra ESPECÍFICA informada pelo usuário. 'Precipitação acumulada', 'chuva acumulada' ou termos similares têm o mesmo significado. Use SOMENTE quando a safra for indicada explicitamente (ex.: '2024/2025', '23/24'). Se a safra não for informada, NÃO pergunte e NÃO chame esta função; prefira a função da safra atual.",
      parameters: {
        type: 'object',
        properties: {
          harvest: {
            type: 'string',
            description: "Safra no formato YYYY/YYYY (ex.: '2024/2025'). Deve ser fornecida explicitamente pelo usuário.",
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentCropWeatherAccumulated',
      description:
        "Retorna a precipitação acumulada (mm) da SAFRA ATUAL. 'Precipitação acumulada', 'chuva acumulada' ou termos similares têm o mesmo significado. Esta é a OPÇÃO PADRÃO quando o usuário pede clima/chuva acumulada sem especificar safra (ex.: 'clima acumulado', 'chuva acumulada', 'da safra atual'). Não requer parâmetros.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPreviousCropWeatherAccumulated',
      description:
        "Retorna a precipitação acumulada (mm) da SAFRA PASSADA (imediatamente anterior à atual). 'Precipitação acumulada', 'chuva acumulada' ou termos similares têm o mesmo significado. Use quando o usuário mencionar 'safra passada', 'safra anterior' ou 'última safra'. Não requer parâmetros.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]
