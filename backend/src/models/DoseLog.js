'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * DoseLog model — tracks whether each scheduled dose was taken, missed, or skipped.
 */
const doseLogSchema = new Schema(
  {
    /** The medication this log entry belongs to */
    medicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Medication',
      required: [true, 'medicationId is required'],
    },

    /** The elder who should take the dose */
    elderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'elderId is required'],
    },

    /** The exact date-time when this dose was scheduled */
    scheduledTime: {
      type: Date,
      required: [true, 'scheduledTime is required'],
    },

    /** Timestamp when the elder actually took the dose (null if not taken) */
    takenAt: {
      type: Date,
      default: null,
    },

    /** Outcome for this scheduled dose.
     *  pending = reminder sent, awaiting confirmation
     *  taken   = elder confirmed
     *  missed  = nightly sweep escalated (no confirmation within 30 min)
     *  skipped = manually skipped
     */
    status: {
      type: String,
      enum: ['pending', 'taken', 'missed', 'skipped'],
      default: 'pending',
    },

    /** Optional free-text note from elder or caregiver */
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

doseLogSchema.index({ medicationId: 1, scheduledTime: 1 });
doseLogSchema.index({ elderId: 1, scheduledTime: -1 });

const DoseLog = mongoose.model('DoseLog', doseLogSchema);
export default DoseLog;
