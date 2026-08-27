const { onCall, HttpsError } = require('firebase-functions/v2/https')
require('./adminInit')
const { callGemini } = require('./geminiClient')
const { assertRateLimit } = require('./rateLimit')

function parseProblemsJson(raw) {
  const cleaned = String(raw)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array')
  }

  return parsed
    .slice(0, 8)
    .map((item, index) => ({
      id: item.id || `practice-${index + 1}`,
      prompt: String(item.prompt ?? '').trim(),
      answer: String(item.answer ?? '').trim(),
      hint: String(item.hint ?? '').trim(),
    }))
    .filter((item) => item.prompt)
}

function clipContext(value, max = 6000) {
  const text = String(value ?? '').trim()
  if (!text) {
    return ''
  }
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}…`
}

exports.generatePractice = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  await assertRateLimit(`ai:practice:${request.auth.uid}`, { max: 30, windowMs: 60 * 60 * 1000 })

  const {
    moduleTitle,
    lessonObjective,
    questionContext,
    gameContext,
    count = 5,
  } = request.data ?? {}

  const problemCount = Math.min(Math.max(Number(count) || 5, 1), 8)
  const topic = lessonObjective || questionContext || moduleTitle || 'this math topic'
  const lessonSample = clipContext(questionContext, 2000)
  const linkedGames = clipContext(gameContext, 6000)

  const systemInstruction = `You create extra math practice for ProvenMath LMS students.
Return ONLY valid JSON — no markdown fences, no commentary.
Each problem must match the lesson objective and be solvable by a high school student.
When linked game questions are provided, adapt their topics, formats, and difficulty into NEW practice problems — do not copy them verbatim.`

  const userPrompt = `Create ${problemCount} practice problems for: "${topic}".
Module title: "${moduleTitle || 'Math practice'}".
${lessonSample ? `Sample lesson context: ${lessonSample}` : ''}
${linkedGames ? `\n${linkedGames}` : ''}

Return a JSON array of objects with keys: "prompt", "answer", "hint".
Use $...$ for inline math. Hints must not give the full answer.`

  const raw = await callGemini({ systemInstruction, userPrompt, temperature: 0.8, maxOutputTokens: 2048 })

  try {
    const problems = parseProblemsJson(raw)
    if (problems.length === 0) {
      throw new Error('No problems parsed')
    }
    return { problems }
  } catch (error) {
    console.error('generatePractice parse error:', error.message, raw?.slice(0, 200))
    throw new HttpsError('internal', 'Could not generate practice problems. Try again.')
  }
})
