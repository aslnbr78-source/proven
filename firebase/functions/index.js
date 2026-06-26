const { personalizedTutor } = require('./personalizedTutor')
const { generatePractice } = require('./generatePractice')
const { getCourseTutorInsights, summarizeStudentTutorActivity } = require('./tutorInsights')
const {
  completeFinalTestSession,
  getFinalTestContent,
  setFinalTestPasscode,
  submitFinalTestAnswer,
  verifyFinalTestPasscode,
} = require('./finalTest')

exports.personalizedTutor = personalizedTutor
exports.generatePractice = generatePractice
exports.getCourseTutorInsights = getCourseTutorInsights
exports.summarizeStudentTutorActivity = summarizeStudentTutorActivity
exports.completeFinalTestSession = completeFinalTestSession
exports.getFinalTestContent = getFinalTestContent
exports.setFinalTestPasscode = setFinalTestPasscode
exports.submitFinalTestAnswer = submitFinalTestAnswer
exports.verifyFinalTestPasscode = verifyFinalTestPasscode
