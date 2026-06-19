export function normalizeAnswer(value) {
  return String(value).trim().replace(/\s+/g, '').toLowerCase()
}

export function getAcceptedAnswers(question) {
  if (Array.isArray(question.answers) && question.answers.length > 0) {
    return question.answers
  }
  if (question.answer != null && question.answer !== '') {
    return [question.answer]
  }
  return []
}

export function matchesAcceptedAnswer(input, acceptedList) {
  const normalized = normalizeAnswer(input)
  return acceptedList.some((accepted) => normalizeAnswer(accepted) === normalized)
}

export function isFillBlankQuestion(question) {
  return question.type === 'fill-blank' || (question.blanks?.length > 0 && question.prompt?.includes('___'))
}

export function countBlanksInPrompt(prompt) {
  return (prompt.match(/___/g) ?? []).length
}
