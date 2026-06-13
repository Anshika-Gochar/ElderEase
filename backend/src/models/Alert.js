// backend/src/models/Alert.js  NEW
'use strict';
import mongoose from 'mongoose';

/**
 * Alert — lightweight notification record created when an anomaly is detected.
 *
 * Alerts are created by the backend's anomaly pipeline (src/routes/ai.js)
 * and consumed by the caregiver dashboard to display actionable notifications.
 *
 * Fields:
 *   elderId  — the elder who triggered the alert
 *   type     — machine-readable alert type (matches AnomalyFlag.type)
 *   message  — human-readable summary string shown in the UI
 *   meta     — raw anomaly details object (payload + severity)
 *   isRead   — false until the caregiver opens/acknowledges it
 */
const alertSchema = new mongoose.Schema(
  {
    elderId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    type: {
      type:     String,
      required: true,
      enum: [
        'sos',                       // Phase 5: SOS button trigger
        'medication_non_adherence',
        'severe_low_mood',
        'social_withdrawal',
        'sos_triggered',
        'low_task_completion',
        'ml_detected_anomaly',
        'missed_dose',
        'anomaly',
      ],
    },
    message: {
      type:     String,
      required: true,
    },
    meta: {
      type:    mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Indexes for fast caregiver dashboard queries
alertSchema.index({ elderId: 1, createdAt: -1 });
alertSchema.index({ elderId: 1, isRead: 1 });

export default mongoose.model('Alert', alertSchema);
