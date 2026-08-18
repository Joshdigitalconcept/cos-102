/**
 * Generates js/firebase-config.js from environment variables.
 * Used locally (optional) and automatically on Vercel build.
 *
 * Env vars (set in Vercel → Project → Settings → Environment Variables):
 *   FIREBASE_API_KEY
 *   FIREBASE_AUTH_DOMAIN
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_STORAGE_BUCKET
 *   FIREBASE_MESSAGING_SENDER_ID
 *   FIREBASE_APP_ID
 *   FIREBASE_ENABLED   (optional, default "true" when keys exist)
 */

const fs = require('fs');
const path = require('path');

const outFile = path.join(__dirname, '..', 'js', 'firebase-config.js');

const apiKey = process.env.FIREBASE_API_KEY || '';
const authDomain = process.env.FIREBASE_AUTH_DOMAIN || '';
const projectId = process.env.FIREBASE_PROJECT_ID || '';
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || '';
const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || '';
const appId = process.env.FIREBASE_APP_ID || '';

const hasKeys = Boolean(apiKey && projectId && apiKey !== 'YOUR_API_KEY');
const enabledEnv = process.env.FIREBASE_ENABLED;
const enabled =
  enabledEnv === 'true' || enabledEnv === '1' ||
  (enabledEnv === undefined && hasKeys);

const content = `/* Auto-generated — do not commit. See firebase-config.example.js */
var FIREBASE_CONFIG = {
  apiKey: ${JSON.stringify(apiKey || 'YOUR_API_KEY')},
  authDomain: ${JSON.stringify(authDomain || 'YOUR_PROJECT.firebaseapp.com')},
  projectId: ${JSON.stringify(projectId || 'YOUR_PROJECT_ID')},
  storageBucket: ${JSON.stringify(storageBucket || 'YOUR_PROJECT.appspot.com')},
  messagingSenderId: ${JSON.stringify(messagingSenderId || 'YOUR_SENDER_ID')},
  appId: ${JSON.stringify(appId || 'YOUR_APP_ID')}
};
var FIREBASE_ENABLED = ${enabled && hasKeys ? 'true' : 'false'};
`;

fs.writeFileSync(outFile, content, 'utf8');

if (hasKeys && enabled) {
  console.log('[generate-firebase-config] Wrote js/firebase-config.js (Firebase ENABLED)');
} else if (hasKeys) {
  console.log('[generate-firebase-config] Wrote js/firebase-config.js (keys present, ENABLED=false)');
} else {
  console.log('[generate-firebase-config] Wrote js/firebase-config.js (placeholders — set Vercel env vars)');
}
