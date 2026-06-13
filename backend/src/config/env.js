'use strict';
import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Critical production variables
const CRITICAL_VARS = ['MONGODB_URI', 'JWT_SECRET'];

// Optional variables that trigger stubs
const STUBBABLE_SERVICES = {
  Twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
  SendGrid: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
  Firebase: ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL'],
};

const missingCritical = [];
const activeServices = {
  Twilio: 'active',
  SendGrid: 'active',
  Firebase: 'active',
};

// Validate critical variables in production
if (isProduction) {
  CRITICAL_VARS.forEach((key) => {
    if (!process.env[key]) {
      missingCritical.push(key);
    }
  });

  if (missingCritical.length > 0) {
    throw new Error(`[FATAL] Missing required production environment variables: ${missingCritical.join(', ')}`);
  }
} else {
  console.log('[Env] Development mode — stub services active for missing keys');
}

// Check stub/active status of optional services
Object.entries(STUBBABLE_SERVICES).forEach(([service, keys]) => {
  const isMissingAny = keys.some((key) => !process.env[key]);
  if (isMissingAny) {
    activeServices[service] = 'stub';
    if (isProduction) {
      console.warn(`[WARNING] Missing variables for ${service}. Falling back to stub mode in production.`);
    }
  }
});

// Print startup configuration logs
console.log('────────────────────────────────────────');
console.log('ElderEase backend starting...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`MongoDB: ${process.env.MONGODB_URI ? 'configured' : 'missing'}`);
console.log(`Twilio: ${activeServices.Twilio}`);
console.log(`SendGrid: ${activeServices.SendGrid}`);
console.log(`Firebase: ${activeServices.Firebase}`);
console.log('────────────────────────────────────────');

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  twilioEnableVoice: process.env.TWILIO_ENABLE_VOICE === 'true',
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL,
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  elderAppUrl: process.env.ELDER_APP_URL || 'http://localhost:5173',
  caregiverAppUrl: process.env.CAREGIVER_APP_URL || 'http://localhost:5174',
};

export default config;
