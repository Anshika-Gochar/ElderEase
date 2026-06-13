'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * AnomalyFlag model — records detected anomalies in elder wellbeing metrics.
 * Used to trigger caregiver alerts and track resolution.
 */
const anomalyFlagSchema = new Schema(
  {
    /** The elder whose behaviour triggered the anomaly */
    elderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'elderId is required'],
    },

    /** Category of anomaly detected */
    type: {
      type: String,
      enum: ['mood_drop', 'missed_meds', 'activity_drop', 'combined', 'sos'],
      required: [true, 'Anomaly type is required'],
    },

    /** How serious the anomaly is rated */
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },

    /**
     * Freeform contextual data about the anomaly.
     * E.g. { moodDrop: 3, daysMissed: 2, lastScore: 4 }
     */
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },

    /** Caregivers who have already been notified about this anomaly */
    notifiedCaregivers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    /** When the anomaly was marked as resolved (null = still active) */
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

anomalyFlagSchema.index({ elderId: 1, createdAt: -1 });
anomalyFlagSchema.index({ type: 1, resolvedAt: 1 });

const AnomalyFlag = mongoose.model('AnomalyFlag', anomalyFlagSchema);
export default AnomalyFlag;
