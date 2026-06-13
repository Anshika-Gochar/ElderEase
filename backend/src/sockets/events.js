'use strict';

/**
 * All Socket.io event name constants used across the ElderEase platform.
 *
 * Import this in any backend file that emits or listens for events:
 *   import { EVENTS } from '../sockets/events.js'
 *
 * Mirror the event names you need in the frontend socket clients.
 */
export const EVENTS = {
  /** Server → Elder: a scheduled dose is due now */
  DOSE_REMINDER: 'dose:reminder',

  /** Server → Elder + Caregivers: elder confirmed a dose as taken */
  DOSE_TAKEN: 'dose:taken',

  /** Server → Caregivers: a dose was not taken and has been marked missed */
  ALERT_MISSED: 'alert:missed',

  /** Server → Caregivers: elder triggered an SOS */
  ALERT_SOS: 'alert:sos',

  /** Server → Caregivers: elder completed a task */
  TASK_COMPLETED: 'task:completed',

  /** Server → Caregivers: a new mood score has been calculated after a chat */
  MOOD_UPDATED: 'mood:updated',

  /** Server → Caregivers: anomaly detection flagged unusual elder behaviour */
  ALERT_ANOMALY: 'alert:anomaly',
};
