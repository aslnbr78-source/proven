import { useCallback, useEffect, useRef, useState } from 'react'
import { evaluateExpression, formatCalcNumber } from '../utils/calcEngine'

const STORAGE_KEY = 'provenmath-calculator-open'

function CalcButton({ label, onClick, className = '', title = '' }) {
  return (
    <button
      type="button"
      title={title || label}
      onClick={() => onClick(label)}
      className={`calc-btn ${className}`}
    >
      {label}
    </button>
  )
}

function ScientificCalculator({ open, onToggle }) {
  const panelRef = useRef(null)
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState('0')
  const [angleMode, setAngleMode] = useState('DEG')
  const [memory, setMemory] = useState(0)
  const [ans, setAns] = useState(0)
  const [error, setError] = useState('')

  const append = useCallback((token) => {
    setError('')
    setExpression((current) => {
      if (token === 'x^') {
        return `${current}^`
      }
      if (token === 'x²') {
        return `${current || '0'}^2`
      }
      if (token === '√') {
        return `${current}sqrt(`
      }
      if (token === '1/x') {
        return `${current || ans || '1'}^(-1)`
      }
      if (token === 'π') {
        return `${current}pi`
      }
      if (token === 'e') {
        return `${current}e`
      }
      if (token === 'ANS') {
        return `${current}ans`
      }
      if (token === 'EXP') {
        return `${current}exp(`
      }
      if (token === 'DEL') {
        return current.slice(0, -1)
      }
      if (token === 'AC') {
        return ''
      }
      if (token === '(' || token === ')') {
        return `${current}${token}`
      }
      if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'abs', 'fact'].includes(token)) {
        return `${current}${token}(`
      }
      return `${current}${token}`
    })
  }, [ans])

  const handleEquals = useCallback(() => {
    try {
      const { value, display } = evaluateExpression(expression, { angleMode, ans })
      setResult(display)
      setAns(value)
      setError('')
    } catch (err) {
      setError(err.message || 'Invalid expression')
      setResult('Error')
    }
  }, [angleMode, ans, expression])

  const handleMemory = useCallback(
    (action) => {
      if (action === 'MC') {
        setMemory(0)
        return
      }
      if (action === 'MR') {
        append(String(memory))
        return
      }
      try {
        const { value } = evaluateExpression(expression || String(ans), { angleMode, ans })
        if (action === 'M+') {
          setMemory((current) => current + value)
        } else if (action === 'M-') {
          setMemory((current) => current - value)
        }
      } catch {
        setError('Could not use memory')
      }
    },
    [angleMode, ans, append, expression],
  )

  const handleButton = useCallback(
    (label) => {
      if (label === '=') {
        handleEquals()
        return
      }
      if (label === 'AC') {
        setExpression('')
        setResult('0')
        setError('')
        return
      }
      if (['MC', 'MR', 'M+', 'M-'].includes(label)) {
        handleMemory(label)
        return
      }
      if (label === 'DEG/RAD') {
        setAngleMode((mode) => (mode === 'DEG' ? 'RAD' : 'DEG'))
        return
      }
      append(label)
    },
    [append, handleEquals, handleMemory],
  )

  useEffect(() => {
    document.documentElement.classList.toggle('calculator-open', open)
    return () => document.documentElement.classList.remove('calculator-open')
  }, [open])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const handleKeyDown = (event) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return
      }

      const key = event.key

      if (key === 'Escape') {
        onToggle(false)
        return
      }
      if (key === 'Enter' || key === '=') {
        event.preventDefault()
        handleEquals()
        return
      }
      if (key === 'Backspace') {
        event.preventDefault()
        append('DEL')
        return
      }
      if (/^[0-9.]$/.test(key)) {
        event.preventDefault()
        append(key)
        return
      }
      if (['+', '-', '*', '/', '^', '(', ')', '%'].includes(key)) {
        event.preventDefault()
        append(key)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [append, handleEquals, onToggle, open])

  const scientificRow1 = ['sin', 'cos', 'tan', 'log', 'ln', '√', 'x²', 'x^', '1/x']
  const scientificRow2 = ['asin', 'acos', 'atan', '(', ')', 'π', 'e', 'abs', 'fact', '%']
  const utilityRow = ['DEG/RAD', 'ANS', 'EXP', 'MC', 'MR', 'M+', 'M-', 'DEL', 'AC']

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open scientific calculator"
          aria-expanded={false}
          onClick={() => onToggle(true)}
          className="calc-fab"
        >
          Calc
        </button>
      )}

      {open && (
        <div ref={panelRef} className="calc-dock" role="dialog" aria-label="Scientific calculator">
          <div className="calc-panel-header">
            <div>
              <p className="calc-panel-title">Scientific Calculator</p>
              <p className="calc-panel-subtitle">{angleMode} · Memory {formatCalcNumber(memory)}</p>
            </div>
            <button type="button" className="calc-close" onClick={() => onToggle(false)}>
              ✕
            </button>
          </div>

          <div className="calc-dock-body">
            <div className="calc-display">
              <p className="calc-expression">{expression || '0'}</p>
              <p className={`calc-result ${error ? 'calc-result-error' : ''}`}>{result}</p>
            </div>

          <div className="calc-grid calc-grid-sci">
            {utilityRow.map((label) => (
              <CalcButton
                key={label}
                label={label}
                onClick={handleButton}
                className="calc-btn-fn"
              />
            ))}
          </div>

          <div className="calc-grid calc-grid-sci">
            {scientificRow1.map((label) => (
              <CalcButton
                key={label}
                label={label}
                onClick={handleButton}
                className="calc-btn-fn"
              />
            ))}
          </div>

          <div className="calc-grid calc-grid-sci">
            {scientificRow2.map((label) => (
              <CalcButton
                key={label}
                label={label}
                onClick={handleButton}
                className="calc-btn-fn"
              />
            ))}
          </div>

          <div className="calc-grid calc-grid-main">
            <CalcButton label="7" onClick={handleButton} />
            <CalcButton label="8" onClick={handleButton} />
            <CalcButton label="9" onClick={handleButton} />
            <CalcButton label="/" onClick={handleButton} className="calc-btn-op" />
            <CalcButton label="4" onClick={handleButton} />
            <CalcButton label="5" onClick={handleButton} />
            <CalcButton label="6" onClick={handleButton} />
            <CalcButton label="*" onClick={handleButton} className="calc-btn-op" />
            <CalcButton label="1" onClick={handleButton} />
            <CalcButton label="2" onClick={handleButton} />
            <CalcButton label="3" onClick={handleButton} />
            <CalcButton label="-" onClick={handleButton} className="calc-btn-op" />
            <CalcButton label="0" onClick={handleButton} />
            <CalcButton label="." onClick={handleButton} />
            <CalcButton label="+" onClick={handleButton} className="calc-btn-op" />
            <CalcButton label="=" onClick={handleButton} className="calc-btn-equals" />
          </div>
          </div>
        </div>
      )}
    </>
  )
}

export function CalculatorLauncher() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const handleToggle = useCallback((next) => {
    setOpen(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore
    }
  }, [])

  return <ScientificCalculator open={open} onToggle={handleToggle} />
}

export default ScientificCalculator
