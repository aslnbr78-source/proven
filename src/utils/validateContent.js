const MODULE_TYPES = ['interactive-lesson', 'quiz', 'flashcard', 'final-test', 'math-game']
const QUESTION_TYPES = ['short-answer', 'fill-blank']

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isAnswerValue(value) {
  return isNonEmptyString(value) || (typeof value === 'number' && Number.isFinite(value))
}

function validateAcceptedAnswers(question, errors) {
  const hasAnswer = isNonEmptyString(question.answer)
  const hasAnswers =
    Array.isArray(question.answers) &&
    question.answers.length > 0 &&
    question.answers.every(isNonEmptyString)

  if (!hasAnswer && !hasAnswers) {
    errors.push('question needs "answer" (string) or "answers" (array of accepted strings)')
  }
}

function validateFillBlank(question, errors) {
  const blankCount = (question.prompt.match(/___/g) ?? []).length

  if (blankCount === 0) {
    errors.push('fill-blank question.prompt must contain ___ for each blank')
  }

  if (!Array.isArray(question.blanks) || question.blanks.length === 0) {
    errors.push('question.blanks must be a non-empty array')
    return
  }

  if (blankCount !== question.blanks.length) {
    errors.push(
      `question.prompt has ${blankCount} blank(s) (___) but blanks array has ${question.blanks.length}`,
    )
  }

  question.blanks.forEach((blank, index) => {
    if (!Array.isArray(blank.accept) || blank.accept.length === 0) {
      errors.push(`question.blanks[${index}].accept must be a non-empty array`)
    } else if (!blank.accept.every(isNonEmptyString)) {
      errors.push(`question.blanks[${index}].accept must contain only non-empty strings`)
    }
  })
}

function validateInteractiveLesson(data, errors) {
  if (!Array.isArray(data.explanation) || data.explanation.length === 0) {
    errors.push('explanation must be a non-empty array of strings')
  }
  if (!data.example?.prompt) {
    errors.push('example.prompt is required')
  }
  if (!Array.isArray(data.example?.steps) || data.example.steps.length === 0) {
    errors.push('example.steps must be a non-empty array')
  }
  if (!isNonEmptyString(data.question?.prompt)) {
    errors.push('question.prompt is required')
  }
  if (!Array.isArray(data.question?.hints)) {
    errors.push('question.hints must be an array')
  }

  const questionType = data.question?.type ?? 'short-answer'
  if (!QUESTION_TYPES.includes(questionType)) {
    errors.push(`question.type must be one of: ${QUESTION_TYPES.join(', ')}`)
  }

  if (questionType === 'fill-blank') {
    validateFillBlank(data.question, errors)
  } else {
    validateAcceptedAnswers(data.question, errors)
  }
}

function validateFinalTest(data, errors) {
  if (typeof data.timeLimit !== 'number' || data.timeLimit < 60) {
    errors.push('timeLimit is required (minimum 60 seconds)')
  }

  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errors.push('questions must be a non-empty array')
    return
  }

  data.questions.forEach((question, index) => {
    if (!isNonEmptyString(question.id)) {
      errors.push(`questions[${index}].id is required`)
    }
    if (!isNonEmptyString(question.prompt)) {
      errors.push(`questions[${index}].prompt is required`)
    }
    if (!Array.isArray(question.options) || question.options.length < 2) {
      errors.push(`questions[${index}].options needs at least 2 items`)
    }
    if (typeof question.correctIndex !== 'number') {
      errors.push(`questions[${index}].correctIndex must be a number`)
    }
    if (!isNonEmptyString(question.feedbackIfWrong)) {
      errors.push(`questions[${index}].feedbackIfWrong is required`)
    }
  })
}

function validateQuiz(data, errors) {
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errors.push('questions must be a non-empty array')
    return
  }

  data.questions.forEach((question, index) => {
    if (!isNonEmptyString(question.id)) {
      errors.push(`questions[${index}].id is required`)
    }
    if (!isNonEmptyString(question.prompt)) {
      errors.push(`questions[${index}].prompt is required`)
    }
    if (!Array.isArray(question.options) || question.options.length < 2) {
      errors.push(`questions[${index}].options needs at least 2 items`)
    }
    if (typeof question.correctIndex !== 'number') {
      errors.push(`questions[${index}].correctIndex must be a number`)
    }
    if (!Array.isArray(question.hints)) {
      errors.push(`questions[${index}].hints must be an array`)
    }
    if (!isNonEmptyString(question.feedbackIfWrong)) {
      errors.push(`questions[${index}].feedbackIfWrong is required`)
    }
  })
}

function validateFlashcard(data, errors) {
  if (!Array.isArray(data.cards) || data.cards.length === 0) {
    errors.push('cards must be a non-empty array')
    return
  }

  data.cards.forEach((card, index) => {
    if (!isNonEmptyString(card.front)) {
      errors.push(`cards[${index}].front is required`)
    }
    if (!isNonEmptyString(card.back)) {
      errors.push(`cards[${index}].back is required`)
    }
  })
}

function validateGameChoiceRound(round, index, errors) {
  if (!Array.isArray(round.choices) || round.choices.length < 2) {
    errors.push(`rounds[${index}].choices needs at least 2 items`)
    return
  }

  const choiceIds = new Set()
  round.choices.forEach((choice, choiceIndex) => {
    if (!isNonEmptyString(choice?.id)) {
      errors.push(`rounds[${index}].choices[${choiceIndex}].id is required`)
    } else {
      choiceIds.add(choice.id)
    }
    if (!isNonEmptyString(choice?.label)) {
      errors.push(`rounds[${index}].choices[${choiceIndex}].label is required`)
    }
  })

  const correctIds = Array.isArray(round.correctIds)
    ? round.correctIds
    : isNonEmptyString(round.correctId)
      ? [round.correctId]
      : []
  if (correctIds.length === 0) {
    errors.push(`rounds[${index}] needs correctId or correctIds`)
    return
  }
  correctIds.forEach((id) => {
    if (!choiceIds.has(id)) {
      errors.push(`rounds[${index}] correct answer "${id}" must match a choice id`)
    }
  })
}

function validateMathGame(data, errors) {
  const rounds = Array.isArray(data.rounds)
    ? data.rounds
    : Array.isArray(data.config?.rounds)
      ? data.config.rounds
      : []
  if (rounds.length === 0) {
    errors.push('rounds must be a non-empty array')
    return
  }

  rounds.forEach((round, index) => {
    if (!round || typeof round !== 'object') {
      errors.push(`rounds[${index}] must be an object`)
      return
    }
    if (!isNonEmptyString(round.prompt) && !isNonEmptyString(round.question)) {
      errors.push(`rounds[${index}].prompt is required`)
    }

    const kind = round.kind ?? (Array.isArray(round.choices) ? 'choice' : 'input')
    if (kind === 'choice' || kind === 'true-false') {
      validateGameChoiceRound(round, index, errors)
    } else if (kind === 'input') {
      const accepted = Array.isArray(round.accept)
        ? round.accept
        : round.answer != null
          ? [round.answer]
          : []
      if (accepted.length === 0 || !accepted.every(isAnswerValue)) {
        errors.push(`rounds[${index}] needs answer or accept values`)
      }
    }
  })
}

export function validateModuleJson(data) {
  const errors = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['JSON must be an object'] }
  }

  if (!MODULE_TYPES.includes(data.type)) {
    errors.push(`type must be one of: ${MODULE_TYPES.join(', ')}`)
  }

  if (!isNonEmptyString(data.id)) {
    errors.push('id is required (lowercase, hyphens — e.g. mean-lesson)')
  }

  if (!isNonEmptyString(data.title)) {
    errors.push('title is required')
  }

  if (data.type === 'interactive-lesson') {
    validateInteractiveLesson(data, errors)
  } else if (data.type === 'quiz') {
    validateQuiz(data, errors)
  } else if (data.type === 'flashcard') {
    validateFlashcard(data, errors)
  } else if (data.type === 'final-test') {
    validateFinalTest(data, errors)
  } else if (data.type === 'math-game') {
    validateMathGame(data, errors)
  }

  return { valid: errors.length === 0, errors, data }
}

export function parseModuleJson(text) {
  try {
    const cleaned = String(text)
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    const data = JSON.parse(cleaned)
    return validateModuleJson(data)
  } catch {
    return { valid: false, errors: ['Invalid JSON — check commas and quotes'] }
  }
}

export const MODULE_TYPE_LABELS = {
  'interactive-lesson': 'Interactive Lesson',
  quiz: 'Quiz',
  flashcard: 'Flashcards',
  'final-test': 'Final Test',
  'math-game': 'Math Game',
}

export const QUESTION_TYPE_LABELS = {
  'short-answer': 'Short answer (typed)',
  'fill-blank': 'Fill in the blank',
  'multiple-choice': 'Multiple choice (quiz only)',
  flashcard: 'Flashcard (self-check)',
}
