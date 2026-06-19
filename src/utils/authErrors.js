const messages = {
  'invalid-credential': 'Invalid email or password.',
  'email-already-in-use': 'An account with this email already exists.',
  'weak-password': 'Password should be at least 6 characters.',
  'invalid-email': 'Please enter a valid email address.',
  'popup-closed-by-user': 'Sign-in was cancelled.',
  'account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
}

export function getAuthErrorMessage(error) {
  const code = error.code?.replace('auth/', '') ?? 'unknown'
  return messages[code] ?? 'Something went wrong. Please try again.'
}
