const { HttpsError } = require('firebase-functions/v2/https')

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function normalizeApiKey(key) {
  return (key ?? '').trim().replace(/^["']|["']$/g, '')
}

function resolveGeminiApiKey() {
  const apiKey = normalizeApiKey(process.env.GOOGLE_AI_API_KEY)
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'GOOGLE_AI_API_KEY is missing in firebase/functions/.env')
  }
  return apiKey
}

async function callGemini({ systemInstruction, userPrompt, maxOutputTokens = 2048, temperature = 0.5 }) {
  const apiKey = resolveGeminiApiKey()
  let lastError = null

  for (const model of GEMINI_MODELS) {
    try {
      const url = `${GEMINI_BASE}/${model}:generateContent`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error?.message || `Gemini HTTP ${response.status}`)
      }

      const text = (body?.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim()

      if (text) {
        return text
      }
    } catch (error) {
      lastError = error
      if (!String(error.message).includes('404')) {
        throw error
      }
    }
  }

  throw lastError ?? new Error('No response from Gemini.')
}

module.exports = {
  callGemini,
}
