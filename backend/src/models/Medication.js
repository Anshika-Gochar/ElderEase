'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Medication model — represents a prescription/medication assigned to an elder.
 */
const medicationSchema = new Schema(
  {
    /** The elder this medication belongs to */
    elderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'elderId is required'],
    },

    /** Medication name (e.g. "Metformin", "Lisinopril") */
    name: {
      type: String,
      required: [true, 'Medication name is required'],
      trim: true,
    },

    /** Dosage string (e.g. "500mg", "10mg", "2 tablets") */
    dose: {
      type: String,
      required: [true, 'Dose is required'],
      trim: true,
    },

    /** How often the medication should be taken */
    frequency: {
      type: String,
      enum: ['once_daily', 'twice_daily', 'thrice_daily', 'weekly', 'as_needed'],
      required: [true, 'Frequency is required'],
    },

    /**
     * Specific times of day to take the medication.
     * Format: 'HH:MM' in 24h (e.g. ['08:00', '14:00', '21:00'])
     */
    scheduledTimes: {
      type: [String],
      default: [],
    },

    /** Additional instructions for the elder or caregiver */
    instructions: {
      type: String,
      trim: true,
    },

    /** Date the medication course begins */
    startDate: {
      type: Date,
    },

    /** Date the medication course ends (null = indefinite) */
    endDate: {
      type: Date,
    },

    /** Whether the medication is currently active */
    isActive: {
      type: Boolean,
      default: true,
    },

    /** Hex color for UI display (e.g. '#2BBD8E') */
    color: {
      type: String,
      default: '#2BBD8E',
    },
  },
  { timestamps: true }
);

medicationSchema.index({ elderId: 1, isActive: 1 });

const Medication = mongoose.model('Medication', medicationSchema);
export default Medication;
