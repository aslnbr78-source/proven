const ANSWER_SEEKING_PATTERNS = [
  /what('s| is) the answer/i,
  /give me the answer/i,
  /just tell me/i,
  /tell me the answer/i,
  /what do i put/i,
  /which (one|option) is (correct|right)/i,
  /solve (this|it) for me/i,
  /do it for me/i,
  /can you (just )?give/i,
  /what should i (pick|choose|select)/i,
  /is it [a-d]\??/i,
  /final answer/i,
]

function detectAnswerSeeking(message) {
  const text = String(message ?? '').trim()
  if (!text) {
    return false
  }
  return ANSWER_SEEKING_PATTERNS.some((pattern) => pattern.test(text))
}

function buildSystemInstruction({
  moduleTitle,
  questionContext,
  skill,
  displayName,
  tutorMode,
  allowFullAnswers,
  contextType,
}) {
  const wrongHistory = skill?.wrongAnswers?.slice(-5).join('; ') || 'none recorded'
  const mastery = skill?.mastery != null ? Math.round(skill.mastery * 100) : 'unknown'
  const isGraded = contextType === 'quiz' || contextType === 'final-test'
  const hintOnly = tutorMode === 'hint-only' || (isGraded && !allowFullAnswers)

  let modeRules = `RULES:
- Never give the final answer directly unless explicitly allowed below.
- Ask guiding questions about their reasoning.
- If they made a mistake before, gently target that misconception.
- Use clear, encouraging language appropriate for a student.
- Keep responses under 120 words.
- You may use simple math notation but avoid long derivations unless asked.`

  if (hintOnly) {
    modeRules = `CRITICAL — HINT-ONLY MODE (graded assessment context):
- You may ONLY give hints, guiding questions, and short conceptual reminders.
- NEVER state the final answer, correct letter choice, or final numeric result.
- NEVER complete the last step of a solution.
- If the student asks for the answer, politely refuse and ask what they've tried.
- Break problems into smaller questions instead of solving them.`
  } else if (allowFullAnswers && isGraded) {
    modeRules += `

TEACHER OVERRIDE: Full explanations are allowed for this assessment, but still prefer guiding the student first.`
  }

  return `You are a Socratic math tutor for ProvenMath LMS.

STUDENT: ${displayName || 'Student'}
TOPIC: ${moduleTitle}
CONTEXT: ${contextType || 'lesson'}
CURRENT QUESTION CONTEXT: ${questionContext || 'general practice'}
MASTERY (0-100): ${mastery}
PAST MISTAKES: ${wrongHistory}

${modeRules}`
}

module.exports = {
  detectAnswerSeeking,
  buildSystemInstruction,
}
