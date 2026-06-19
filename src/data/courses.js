export const courses = [
  {
    id: 'algebra-1',
    title: 'Algebra I',
    description: 'Linear equations, inequalities, and functions.',
    lessonCount: 6,
  },
]

export function getCourseById(courseId) {
  return courses.find((course) => course.id === courseId)
}
