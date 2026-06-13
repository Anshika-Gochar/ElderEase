// backend/src/models/CaregiverNote.js  NEW
'use strict';

/**
 * CaregiverNote — clinical observations and notes written by caregivers
 * about their linked elders.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const caregiverNoteSchema = new Schema(
  {
    /** The caregiver who wrote this note */
    caregiverId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'caregiverId is required'],
    },

    /** The elder this note is about */
    elderId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'elderId is required'],
    },

    /** Note content */
    content: {
      type:      String,
      required:  [true, 'content is required'],
      trim:      true,
      maxlength: [1000, 'Note cannot exceed 1000 characters'],
    },

    /** Classification for filtering */
    category: {
      type:    String,
      enum:    ['observation', 'concern', 'positive', 'general'],
      default: 'general',
    },
  },
  { timestamps: true }
);

// Index: fast lookup by elder, newest first
caregiverNoteSchema.index({ elderId: 1, createdAt: -1 });

const CaregiverNote = mongoose.model('CaregiverNote', caregiverNoteSchema);
export default CaregiverNote;
