const FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'log',
  'ln',
  'sqrt',
  'abs',
  'exp',
  'fact',
])

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
}

function factorial(n) {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Invalid factorial')
  }
  if (!Number.isInteger(n)) {
    throw new Error('Factorial requires an integer')
  }
  if (n > 170) {
    throw new Error('Factorial too large')
  }
  let result = 1
  for (let i = 2; i <= n; i += 1) {
    result *= i
  }
  return result
}

function toRadians(value, angleMode) {
  return angleMode === 'DEG' ? (value * Math.PI) / 180 : value
}

function fromRadians(value, angleMode) {
  return angleMode === 'DEG' ? (value * 180) / Math.PI : value
}

function applyFunction(name, value, angleMode) {
  switch (name) {
    case 'sin':
      return Math.sin(toRadians(value, angleMode))
    case 'cos':
      return Math.cos(toRadians(value, angleMode))
    case 'tan':
      return Math.tan(toRadians(value, angleMode))
    case 'asin':
      return fromRadians(Math.asin(value), angleMode)
    case 'acos':
      return fromRadians(Math.acos(value), angleMode)
    case 'atan':
      return fromRadians(Math.atan(value), angleMode)
    case 'log':
      return Math.log10(value)
    case 'ln':
      return Math.log(value)
    case 'sqrt':
      return Math.sqrt(value)
    case 'abs':
      return Math.abs(value)
    case 'exp':
      return Math.exp(value)
    case 'fact':
      return factorial(value)
    default:
      throw new Error(`Unknown function ${name}`)
  }
}

function tokenize(expression) {
  const input = String(expression)
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\^/g, '^')

  const tokens = []
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (/\d/.test(char) || (char === '.' && /\d/.test(input[index + 1] ?? ''))) {
      let end = index + 1
      while (end < input.length && /[\d.]/.test(input[end])) {
        end += 1
      }
      tokens.push({ type: 'number', value: Number(input.slice(index, end)) })
      index = end
      continue
    }

    if (/[a-z]/i.test(char)) {
      let end = index + 1
      while (end < input.length && /[a-z]/i.test(input[end])) {
        end += 1
      }
      const word = input.slice(index, end).toLowerCase()
      if (word === 'ans') {
        tokens.push({ type: 'ans' })
      } else if (FUNCTIONS.has(word)) {
        tokens.push({ type: 'function', name: word })
      } else if (word in CONSTANTS) {
        tokens.push({ type: 'number', value: CONSTANTS[word] })
      } else {
        throw new Error(`Unknown symbol ${word}`)
      }
      index = end
      continue
    }

    if ('+-*/^%(),!'.includes(char)) {
      if (char === '!') {
        tokens.push({ type: 'postfix', op: '!' })
      } else {
        tokens.push({ type: 'operator', op: char })
      }
      index += 1
      continue
    }

    throw new Error(`Unexpected character ${char}`)
  }

  return tokens
}

class Parser {
  constructor(tokens, angleMode, ans) {
    this.tokens = tokens
    this.index = 0
    this.angleMode = angleMode
    this.ans = ans
  }

  peek() {
    return this.tokens[this.index]
  }

  consume(expectedType) {
    const token = this.tokens[this.index]
    if (!token || token.type !== expectedType) {
      throw new Error('Invalid expression')
    }
    this.index += 1
    return token
  }

  parse() {
    if (this.tokens.length === 0) {
      return this.ans
    }
    const value = this.parseExpression()
    if (this.index < this.tokens.length) {
      throw new Error('Invalid expression')
    }
    if (!Number.isFinite(value)) {
      throw new Error('Result is not a number')
    }
    return value
  }

  parseExpression() {
    let value = this.parseTerm()
    while (this.peek()?.type === 'operator' && (this.peek().op === '+' || this.peek().op === '-')) {
      const op = this.consume('operator').op
      const right = this.parseTerm()
      value = op === '+' ? value + right : value - right
    }
    return value
  }

  parseTerm() {
    let value = this.parsePower()
    while (
      this.peek()?.type === 'operator' &&
      (this.peek().op === '*' || this.peek().op === '/' || this.peek().op === '%')
    ) {
      const op = this.consume('operator').op
      const right = this.parsePower()
      if (op === '*') {
        value *= right
      } else if (op === '/') {
        if (right === 0) {
          throw new Error('Division by zero')
        }
        value /= right
      } else {
        value %= right
      }
    }
    return value
  }

  parsePower() {
    let value = this.parseUnary()
    while (this.peek()?.type === 'operator' && this.peek().op === '^') {
      this.consume('operator')
      const right = this.parseUnary()
      value = value ** right
    }
    return value
  }

  parseUnary() {
    if (this.peek()?.type === 'operator' && this.peek().op === '-') {
      this.consume('operator')
      return -this.parseUnary()
    }
    if (this.peek()?.type === 'operator' && this.peek().op === '+') {
      this.consume('operator')
      return this.parseUnary()
    }
    return this.parsePostfix()
  }

  parsePostfix() {
    let value = this.parsePrimary()
    while (this.peek()?.type === 'postfix' && this.peek().op === '!') {
      this.consume('postfix')
      value = factorial(value)
    }
    return value
  }

  parsePrimary() {
    const token = this.peek()
    if (!token) {
      throw new Error('Invalid expression')
    }

    if (token.type === 'number') {
      this.consume('number')
      return token.value
    }

    if (token.type === 'ans') {
      this.consume('ans')
      return this.ans
    }

    if (token.type === 'function') {
      const { name } = this.consume('function')
      this.consume('operator')
      if (this.tokens[this.index - 1]?.op !== '(') {
        throw new Error('Expected (')
      }
      const arg = this.parseExpression()
      if (this.peek()?.type !== 'operator' || this.peek().op !== ')') {
        throw new Error('Expected )')
      }
      this.consume('operator')
      return applyFunction(name, arg, this.angleMode)
    }

    if (token.type === 'operator' && token.op === '(') {
      this.consume('operator')
      const value = this.parseExpression()
      if (this.peek()?.type !== 'operator' || this.peek().op !== ')') {
        throw new Error('Expected )')
      }
      this.consume('operator')
      return value
    }

    throw new Error('Invalid expression')
  }
}

export function evaluateExpression(expression, { angleMode = 'DEG', ans = 0 } = {}) {
  const trimmed = String(expression ?? '').trim()
  if (!trimmed) {
    return ans
  }

  const tokens = tokenize(trimmed)
  const parser = new Parser(tokens, angleMode, ans)
  const result = parser.parse()

  const rounded = Math.abs(result) < 1e-12 ? 0 : result
  const display =
    Math.abs(rounded) >= 1e10 || (Math.abs(rounded) < 1e-6 && rounded !== 0)
      ? rounded.toExponential(10).replace(/\.?0+e/, 'e')
      : Number.parseFloat(rounded.toPrecision(12)).toString()

  return { value: rounded, display }
}

export function formatCalcNumber(value) {
  if (!Number.isFinite(value)) {
    return 'Error'
  }
  if (Math.abs(value) >= 1e10 || (Math.abs(value) < 1e-6 && value !== 0)) {
    return value.toExponential(8).replace(/\.?0+e/, 'e')
  }
  return Number.parseFloat(value.toPrecision(12)).toString()
}
