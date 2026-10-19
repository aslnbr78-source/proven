const MODULE_TYPES = ['interactive-lesson', 'quiz', 'flashcard', 'final-test', 'math-game']
const QUESTION_TYPES = ['short-answer', 'fill-blank']
const GAME_ROUND_TYPES = [
  'choice',
  'true-false',
  'input',
  'multi',
  'match',
  'sort',
  'order',
  'spot',
]

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

function hasChoiceId(choices, id) {
  return choices.some((choice) => choice?.id === id)
}

function validateGameChoices(round, roundPath, errors) {
  if (!Array.isArray(round.choices) || round.choices.length < 2) {
    errors.push(`${roundPath}.choices needs at least 2 items`)
    return []
  }

  const ids = new Set()
  round.choices.forEach((choice, choiceIndex) => {
    const choicePath = `${roundPath}.choices[${choiceIndex}]`
    if (!isNonEmptyString(choice?.id)) {
      errors.push(`${choicePath}.id is required`)
    } else if (ids.has(choice.id)) {
      errors.push(`${choicePath}.id must be unique`)
    } else {
      ids.add(choice.id)
    }
    if (!isNonEmptyString(choice?.label)) {
      errors.push(`${choicePath}.label is required`)
    }
  })

  return round.choices
}

function validateMathGame(data, errors) {
  const rounds = Array.isArray(data.rounds) ? data.rounds : data.config?.rounds
  if (!Array.isArray(rounds) || rounds.length === 0) {
    errors.push('rounds must be a non-empty array')
    return
  }

  if (!isNonEmptyString(data.game ?? data.config?.game)) {
    errors.push('game is required')
  }

  rounds.forEach((round, index) => {
    const roundPath = `rounds[${index}]`
    if (!round || typeof round !== 'object') {
      errors.push(`${roundPath} must be an object`)
      return
    }

    const kind =
      round.kind ??
      (Array.isArray(round.choices) && isNonEmptyString(round.correctId) ? 'choice' : null)

    if (!GAME_ROUND_TYPES.includes(kind)) {
      errors.push(`${roundPath}.kind must be one of: ${GAME_ROUND_TYPES.join(', ')}`)
    }
    if (!isNonEmptyString(round.prompt)) {
      errors.push(`${roundPath}.prompt is required`)
    }
    if (!isNonEmptyString(round.explain)) {
      errors.push(`${roundPath}.explain is required`)
    }
    if (!isNonEmptyString(round.missExplain)) {
      errors.push(`${roundPath}.missExplain is required`)
    }

    if (kind === 'choice') {
      const choices = validateGameChoices(round, roundPath, errors)
      if (!isNonEmptyString(round.correctId)) {
        errors.push(`${roundPath}.correctId is required`)
      } else if (choices.length > 0 && !hasChoiceId(choices, round.correctId)) {
        errors.push(`${roundPath}.correctId must match a choice id`)
      }
    } else if (kind === 'true-false') {
      if (typeof round.answer !== 'boolean') {
        errors.push(`${roundPath}.answer must be true or false`)
      }
    } else if (kind === 'input') {
      const hasAnswer = isNonEmptyString(round.answer)
      const hasAccept =
        Array.isArray(round.accept) &&
        round.accept.length > 0 &&
        round.accept.every(isNonEmptyString)
      if (!hasAnswer && !hasAccept) {
        errors.push(`${roundPath} needs "answer" or "accept"`)
      }
    } else if (kind === 'multi') {
      const choices = validateGameChoices(round, roundPath, errors)
      if (!Array.isArray(round.correctIds) || round.correctIds.length === 0) {
        errors.push(`${roundPath}.correctIds must be a non-empty array`)
      } else if (choices.length > 0) {
        round.correctIds.forEach((id) => {
          if (!hasChoiceId(choices, id)) {
            errors.push(`${roundPath}.correctIds contains unknown choice id "${id}"`)
          }
        })
      }
    } else if (kind === 'match') {
      if (!Array.isArray(round.pairs) || round.pairs.length < 2) {
        errors.push(`${roundPath}.pairs needs at least 2 items`)
      }
    } else if (kind === 'sort') {
      const binIds = new Set()
      if (!Array.isArray(round.bins) || round.bins.length < 2) {
        errors.push(`${roundPath}.bins needs at least 2 items`)
      } else {
        round.bins.forEach((bin, binIndex) => {
          if (!isNonEmptyString(bin?.id)) {
            errors.push(`${roundPath}.bins[${binIndex}].id is required`)
          } else {
            binIds.add(bin.id)
          }
          if (!isNonEmptyString(bin?.label)) {
            errors.push(`${roundPath}.bins[${binIndex}].label is required`)
          }
        })
      }
      if (!Array.isArray(round.items) || round.items.length < 2) {
        errors.push(`${roundPath}.items needs at least 2 items`)
      } else {
        round.items.forEach((item, itemIndex) => {
          if (!isNonEmptyString(item?.id)) {
            errors.push(`${roundPath}.items[${itemIndex}].id is required`)
          }
          if (!isNonEmptyString(item?.label)) {
            errors.push(`${roundPath}.items[${itemIndex}].label is required`)
          }
          if (!isNonEmptyString(item?.binId) || (binIds.size > 0 && !binIds.has(item.binId))) {
            errors.push(`${roundPath}.items[${itemIndex}].binId must match a bin id`)
          }
        })
      }
    } else if (kind === 'order') {
      const itemIds = new Set()
      if (!Array.isArray(round.items) || round.items.length < 2) {
        errors.push(`${roundPath}.items needs at least 2 items`)
      } else {
        round.items.forEach((item, itemIndex) => {
          if (!isNonEmptyString(item?.id)) {
            errors.push(`${roundPath}.items[${itemIndex}].id is required`)
          } else {
            itemIds.add(item.id)
          }
          if (!isNonEmptyString(item?.label)) {
            errors.push(`${roundPath}.items[${itemIndex}].label is required`)
          }
        })
      }
      if (!Array.isArray(round.correctOrder) || round.correctOrder.length === 0) {
        errors.push(`${roundPath}.correctOrder must be a non-empty array`)
      } else if (itemIds.size > 0) {
        round.correctOrder.forEach((id) => {
          if (!itemIds.has(id)) {
            errors.push(`${roundPath}.correctOrder contains unknown item id "${id}"`)
          }
        })
      }
    } else if (kind === 'spot') {
      if (!isNonEmptyString(round.sentence)) {
        errors.push(`${roundPath}.sentence is required`)
      }
      if (!isNonEmptyString(round.wrongWord) && typeof round.wrongIndex !== 'number') {
        errors.push(`${roundPath} needs "wrongWord" or "wrongIndex"`)
      }
      if (!isNonEmptyString(round.fix)) {
        errors.push(`${roundPath}.fix is required`)
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

  return { valid: errors.length === 0, errors, warnings: [], data }
}

function stripMarkdownJsonFence(text) {
  const trimmed = String(text ?? '').trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : trimmed
}

export function parseModuleJson(text) {
  try {
    const data = JSON.parse(stripMarkdownJsonFence(text))
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
