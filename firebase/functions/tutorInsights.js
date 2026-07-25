const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { callGemini } = require('./geminiClient')
require('./adminInit')

function normalizeQuestion(text) {
  return String(text ?? '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\$+/g, '')
    .trim()
    .toLowerCase()
    .slice(0, 200)
}

async function assertTeacher(uid) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required')
  }

  const db = getFirestore()
  const userSnap = await db.doc(`users/${uid}`).get()
  const user = userSnap.data() ?? {}
  const role = user.role
  if (role !== 'teacher' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Teacher access required')
  }

  return { uid, ...user }
}

async function assertCourseTeacher(db, teacher, courseId) {
  const courseSnap = await db.doc(`courses/${courseId}`).get()
  if (!courseSnap.exists) {
    throw new HttpsError('not-found', 'Course not found')
  }

  const course = courseSnap.data() ?? {}
  const ownsCourse =
    course.updatedBy === teacher.uid ||
    (course.ownerEmail && teacher.email && course.ownerEmail === teacher.email)

  if (teacher.role !== 'admin' && !ownsCourse) {
    throw new HttpsError('permission-denied', 'You do not have access to this course')
  }
}

function aggregateChallenges(activityRows, moduleTitles = {}) {
  const byModule = new Map()

  for (const row of activityRows) {
    const moduleId = row.moduleId
    if (!moduleId) {
      continue
    }

    if (!byModule.has(moduleId)) {
      byModule.set(moduleId, {
        moduleId,
        moduleTitle: moduleTitles[moduleId] ?? row.moduleTitle ?? moduleId,
        messageCount: 0,
        answerSeekingCount: 0,
        studentIds: new Set(),
        questionCounts: new Map(),
        contextCounts: { lesson: 0, quiz: 0, 'final-test': 0 },
      })
    }

    const entry = byModule.get(moduleId)
    entry.messageCount += 1
    if (row.answerSeeking) {
      entry.answerSeekingCount += 1
    }
    if (row.uid) {
      entry.studentIds.add(row.uid)
    }

    const contextType = row.contextType ?? 'lesson'
    entry.contextCounts[contextType] = (entry.contextCounts[contextType] ?? 0) + 1

    const questionKey = normalizeQuestion(row.studentMessage)
    if (questionKey) {
      entry.questionCounts.set(questionKey, (entry.questionCounts.get(questionKey) ?? 0) + 1)
    }
  }

  return [...byModule.values()]
    .map((entry) => {
      const topQuestions = [...entry.questionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count }))

      const contextParts = Object.entries(entry.contextCounts)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${type}`)

      return {
        moduleId: entry.moduleId,
        moduleTitle: entry.moduleTitle,
        messageCount: entry.messageCount,
        answerSeekingCount: entry.answerSeekingCount,
        studentCount: entry.studentIds.size,
        topQuestions,
        contextSummary: contextParts.join(', ') || 'no activity',
        summary:
          topQuestions.length > 0
            ? `Students asked about: ${topQuestions
                .slice(0, 2)
                .map((item) => item.label)
                .join('; ')}`
            : `${entry.messageCount} tutor message(s) from ${entry.studentIds.size} student(s).`,
      }
    })
    .sort((a, b) => b.messageCount - a.messageCount)
}

function aggregateStudents(activityRows, moduleTitles = {}) {
  const byStudent = new Map()

  for (const row of activityRows) {
    if (!row.uid) {
      continue
    }

    if (!byStudent.has(row.uid)) {
      byStudent.set(row.uid, {
        uid: row.uid,
        studentName: row.studentName ?? '',
        studentEmail: row.studentEmail ?? '',
        messageCount: 0,
        answerSeekingCount: 0,
        moduleIds: new Set(),
        questionCounts: new Map(),
        contextCounts: { lesson: 0, quiz: 0, 'final-test': 0 },
        lastActiveMillis: 0,
      })
    }

    const entry = byStudent.get(row.uid)
    entry.messageCount += 1
    if (row.answerSeeking) {
      entry.answerSeekingCount += 1
    }
    if (row.moduleId) {
      entry.moduleIds.add(row.moduleId)
    }

    const contextType = row.contextType ?? 'lesson'
    entry.contextCounts[contextType] = (entry.contextCounts[contextType] ?? 0) + 1

    const questionKey = normalizeQuestion(row.studentMessage)
    if (questionKey) {
      entry.questionCounts.set(questionKey, (entry.questionCounts.get(questionKey) ?? 0) + 1)
    }

    const millis = row.createdAtMillis ?? 0
    if (millis > entry.lastActiveMillis) {
      entry.lastActiveMillis = millis
    }
  }

  return [...byStudent.values()]
    .map((entry) => {
      const topQuestions = [...entry.questionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count }))

      const contextParts = Object.entries(entry.contextCounts)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${type}`)

      const moduleTitlesList = [...entry.moduleIds].map((id) => moduleTitles[id] ?? id)

      return {
        uid: entry.uid,
        studentName: entry.studentName,
        studentEmail: entry.studentEmail,
        messageCount: entry.messageCount,
        answerSeekingCount: entry.answerSeekingCount,
        moduleCount: entry.moduleIds.size,
        moduleTitles: moduleTitlesList,
        topQuestions,
        contextSummary: contextParts.join(', ') || 'no activity',
        lastActiveMillis: entry.lastActiveMillis,
        summary:
          topQuestions.length > 0
            ? `Often asked: ${topQuestions
                .slice(0, 2)
                .map((item) => item.label)
                .join('; ')}`
            : `${entry.messageCount} tutor message(s) across ${entry.moduleIds.size} module(s).`,
      }
    })
    .sort((a, b) => b.messageCount - a.messageCount)
}

function mapActivityDoc(item) {
  const data = item.data()
  return {
    id: item.id,
    ...data,
    createdAtMillis: data.createdAt?.toMillis?.() ?? null,
  }
}

async function loadCourseActivity(db, courseId, limitCount = 500) {
  const snap = await db
    .collection(`courses/${courseId}/tutorActivity`)
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get()

  return snap.docs.map(mapActivityDoc)
}

exports.getCourseTutorInsights = onCall(async (request) => {
  const uid = request.auth?.uid
  const teacher = await assertTeacher(uid)

  const { courseId, moduleTitles = {} } = request.data ?? {}
  if (!courseId) {
    throw new HttpsError('invalid-argument', 'courseId is required')
  }

  const db = getFirestore()
  await assertCourseTeacher(db, teacher, courseId)
  const activity = await loadCourseActivity(db, courseId)

  const reviewQueue = activity.filter(
    (row) => row.answerSeeking && row.reviewStatus === 'pending',
  )

  return {
    activity,
    tutorChallenges: aggregateChallenges(activity, moduleTitles),
    studentInsights: aggregateStudents(activity, moduleTitles),
    reviewQueue,
    totalLogged: activity.length,
  }
})

exports.summarizeStudentTutorActivity = onCall(async (request) => {
  const teacherUid = request.auth?.uid
  const teacher = await assertTeacher(teacherUid)

  const { courseId, studentUid, moduleTitles = {}, forceRefresh = false } = request.data ?? {}
  if (!courseId || !studentUid) {
    throw new HttpsError('invalid-argument', 'courseId and studentUid are required')
  }

  const db = getFirestore()
  await assertCourseTeacher(db, teacher, courseId)
  const activitySnap = await db
    .collection(`courses/${courseId}/tutorActivity`)
    .where('uid', '==', studentUid)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()

  const messages = activitySnap.docs.map(mapActivityDoc).reverse()

  if (messages.length === 0) {
    throw new HttpsError('not-found', 'No tutor messages found for this student in this course.')
  }

  const summaryRef = db.doc(`courses/${courseId}/studentTutorSummaries/${studentUid}`)
  const cachedSnap = await summaryRef.get()

  if (!forceRefresh && cachedSnap.exists) {
    const cached = cachedSnap.data()
    if (cached.messageCount === messages.length) {
      return {
        summary: cached.summary,
        cached: true,
        messageCount: messages.length,
        generatedAtMillis: cached.generatedAt?.toMillis?.() ?? null,
      }
    }
  }

  const studentName = messages[messages.length - 1]?.studentName || studentUid
  const transcript = messages
    .map((row, index) => {
      const moduleLabel = moduleTitles[row.moduleId] ?? row.moduleTitle ?? row.moduleId ?? 'unknown'
      const context = row.contextType ?? 'lesson'
      const flag = row.answerSeeking ? ' [answer-seeking]' : ''
      return `${index + 1}. [${context} · ${moduleLabel}]${flag} ${row.studentMessage}`
    })
    .join('\n')

  const systemInstruction = `You are an expert math teacher reviewing AI tutor logs for one student.
Write a concise teacher-facing report (not for the student).
Focus on: concepts they struggle with, recurring misconceptions, answer-seeking behavior, and recommended next steps.
Use short sections with bullet points. Be specific and actionable. Max 350 words.`

  const userPrompt = `Course tutor log for student: ${studentName}
Total messages: ${messages.length}
Answer-seeking messages: ${messages.filter((row) => row.answerSeeking).length}

Transcript (oldest to newest):
${transcript}

Write a summary report for the teacher.`

  let summary
  try {
    summary = await callGemini({ systemInstruction, userPrompt, maxOutputTokens: 1024, temperature: 0.4 })
  } catch (error) {
    console.error('summarizeStudentTutorActivity Gemini error:', error.message)
    throw new HttpsError('internal', 'Could not generate AI summary. Try again.')
  }

  await summaryRef.set({
    uid: studentUid,
    studentName,
    studentEmail: messages[messages.length - 1]?.studentEmail ?? '',
    summary,
    messageCount: messages.length,
    generatedAt: FieldValue.serverTimestamp(),
    generatedBy: teacherUid,
  })

  return {
    summary,
    cached: false,
    messageCount: messages.length,
    generatedAtMillis: Date.now(),
  }
})
