const { getApps, initializeApp } = require('firebase-admin/app')

if (!getApps().length) {
  initializeApp()
}
