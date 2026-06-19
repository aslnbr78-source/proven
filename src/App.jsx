import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import PageLoader from './components/PageLoader'
import MainLayout from './layouts/MainLayout'
import { ROLES } from './utils/roles'

const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Hub = lazy(() => import('./pages/Hub'))
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'))
const ContentManager = lazy(() => import('./pages/ContentManager'))
const CourseBuilder = lazy(() => import('./pages/CourseBuilder'))
const CourseAssets = lazy(() => import('./pages/CourseAssets'))
const ReportingDashboard = lazy(() => import('./pages/ReportingDashboard'))
const AIInsightsDashboard = lazy(() => import('./pages/AIInsightsDashboard'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const CoursePlayer = lazy(() => import('./pages/CoursePlayer'))

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/hub"
              element={
                <ProtectedRoute>
                  <Hub />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/content"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <ContentManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/content/:courseId"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <ContentManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/courses"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <CourseBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/courses/:courseId"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <CourseBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/assets"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <CourseAssets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/reports"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <ReportingDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/ai-insights"
              element={
                <ProtectedRoute allowedRoles={[ROLES.TEACHER, ROLES.ADMIN]}>
                  <AIInsightsDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <ReportingDashboard adminView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ai-insights"
              element={
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <AIInsightsDashboard adminView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courses/:courseId"
              element={
                <ProtectedRoute>
                  <CoursePlayer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courses/:courseId/modules/:moduleId"
              element={
                <ProtectedRoute>
                  <CoursePlayer />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
