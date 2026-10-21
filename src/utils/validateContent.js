const MODULE_TYPES = ['interactive-lesson', 'quiz', 'flashcard', 'final-test']
const QUESTION_TYPES = ['short-answer', 'fill-blank']

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
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

function validateStringArray(value, label, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`)
    return false
  }

  if (!allowEmpty && value.length === 0) {
    errors.push(`${label} must be a non-empty array`)
    return false
  }

  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      errors.push(`${label}[${index}] must be a non-empty string`)
    }
  })

  return true
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
  validateStringArray(data.explanation, 'explanation', errors)
  if (!isNonEmptyString(data.example?.prompt)) {
    errors.push('example.prompt is required')
  }
  validateStringArray(data.example?.steps, 'example.steps', errors)
  if (!isNonEmptyString(data.question?.prompt)) {
    errors.push('question.prompt is required')
  }
  validateStringArray(data.question?.hints, 'question.hints', errors, { allowEmpty: true })

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
    } else {
      question.options.forEach((option, optionIndex) => {
        if (!isNonEmptyString(option)) {
          errors.push(`questions[${index}].options[${optionIndex}] must be a non-empty string`)
        }
      })
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
    } else {
      question.options.forEach((option, optionIndex) => {
        if (!isNonEmptyString(option)) {
          errors.push(`questions[${index}].options[${optionIndex}] must be a non-empty string`)
        }
      })
    }
    if (typeof question.correctIndex !== 'number') {
      errors.push(`questions[${index}].correctIndex must be a number`)
    }
    validateStringArray(question.hints, `questions[${index}].hints`, errors, { allowEmpty: true })
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
  }

  return { valid: errors.length === 0, errors, data }
}

export function parseModuleJson(text) {
  try {
    const data = JSON.parse(text)
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
}

export const QUESTION_TYPE_LABELS = {
  'short-answer': 'Short answer (typed)',
  'fill-blank': 'Fill in the blank',
  'multiple-choice': 'Multiple choice (quiz only)',
  flashcard: 'Flashcard (self-check)',
}
