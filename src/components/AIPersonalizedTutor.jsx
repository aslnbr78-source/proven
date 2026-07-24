import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { askPersonalizedTutor } from '../services/tutorService'
import MathBlock from './MathBlock'

function buildWelcomeMessage({ profile, moduleTitle, tutorMode, contextType }) {
  const name = profile?.displayName ? ` ${profile.displayName}` : ''
  if (tutorMode === 'hint-only') {
    return `Hi${name}! Hint-only mode for "${moduleTitle}" — I'll guide you with questions and hints, not final answers.`
  }
  if (contextType === 'quiz' || contextType === 'final-test') {
    return `Hi${name}! I'm here to help with "${moduleTitle}". Ask about concepts or where to start.`
  }
  return `Hi${name}! I'm your math tutor for "${moduleTitle}" — I'll guide you without giving away the final answer.`
}

function AIPersonalizedTutor({
  courseId,
  moduleId,
  moduleTitle,
  questionContext,
  overlay = false,
  tutorMode = 'standard',
  allowFullAnswers = false,
  contextType = 'lesson',
}) {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const sessionId = useRef(`${courseId}-${moduleId}`)
  const bottomRef = useRef(null)

  const welcomeMessage = useMemo(
    () =>
      buildWelcomeMessage({
        profile,
        moduleTitle,
        tutorMode,
        contextType,
      }),
    [profile, moduleTitle, tutorMode, contextType],
  )

  useEffect(() => {
    setMessages([{ role: 'assistant', content: welcomeMessage }])
  }, [welcomeMessage, courseId, moduleId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (event) => {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) {
      return
    }

    setInput('')
    setMessages((previous) => [...previous, { role: 'user', content: text }])
    setLoading(true)

    try {
      const result = await askPersonalizedTutor({
        uid: user?.uid,
        courseId,
        moduleId,
        moduleTitle,
        studentMessage: text,
        questionContext,
        sessionId: sessionId.current,
        tutorMode,
        allowFullAnswers,
        contextType,
      })

      const reply = result.reply ?? 'Let me think about that with you. What have you tried so far?'
      setMessages((previous) => [...previous, { role: 'assistant', content: reply }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`flex flex-col ${
        overlay
          ? 'h-full rounded-xl border border-violet-300/80 bg-slate-900/95 shadow-2xl'
          : 'h-full rounded-lg border border-violet-200 bg-violet-50/50'
      }`}
    >
      <div
        className={`border-b px-4 py-3 ${
          overlay ? 'border-violet-500/40' : 'border-violet-200'
        }`}
      >
        <h3 className={`font-semibold ${overlay ? 'text-violet-100' : 'text-violet-900'}`}>
          AI Tutor
        </h3>
        <p className={`text-xs ${overlay ? 'text-violet-200/90' : 'text-violet-700'}`}>
          {tutorMode === 'hint-only'
            ? 'Hint-only — Socratic guidance during graded work'
            : 'Socratic help — remembers your past mistakes'}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
              message.role === 'user'
                ? 'ml-auto bg-blue-600 text-white'
                : overlay
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'bg-white text-slate-800 shadow-sm'
            }`}
          >
            <MathBlock text={message.content} />
          </div>
        ))}
        {loading && (
          <p className={`text-sm ${overlay ? 'text-violet-200' : 'text-slate-500'}`}>
            Tutor is thinking…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className={`border-t p-3 ${overlay ? 'border-violet-500/40' : 'border-violet-200'}`}
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              tutorMode === 'hint-only'
                ? 'Ask for a hint or explain your thinking…'
                : 'Ask a question or explain your thinking…'
            }
            className={`flex-1 rounded border px-3 py-2 text-sm focus:outline-none ${
              overlay
                ? 'border-slate-600 bg-slate-800 text-white placeholder:text-slate-400 focus:border-violet-400'
                : 'border-slate-300 focus:border-violet-500'
            }`}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}

export default AIPersonalizedTutor
