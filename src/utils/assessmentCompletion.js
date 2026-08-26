export function countAnsweredQuestions(questions = [], answered = {}) {
  if (!Array.isArray(questions)) {
    return 0
  }

  return questions.filter((question) => question?.id && answered?.[question.id]).length
}

export function hasAnsweredEveryQuestion(questions = [], answered = {}) {
  return Array.isArray(questions) && questions.length > 0 && countAnsweredQuestions(questions, answered) === questions.length
}
