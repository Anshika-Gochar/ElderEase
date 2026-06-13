'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Task model — daily/recurring activities for elders (exercises, health checks, social, etc.)
 */
const taskSchema = new Schema(
  {
    /** Elder this task is assigned to */
    elderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'elderId is required'],
    },

    /** User (caregiver or elder) who created the task */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    /** Short task title shown in the UI */
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },

    /** Optional longer description or instructions */
    description: {
      type: String,
      trim: true,
    },

    /** Broad category for grouping and icon display */
    category: {
      type: String,
      enum: ['exercise', 'health', 'social', 'medication', 'other'],
      default: 'other',
    },

    /** Suggested time of day for this task (HH:MM, 24h format) */
    scheduledTime: {
      type: String,
    },

    /** Whether the task repeats on a schedule */
    isRecurring: {
      type: Boolean,
      default: true,
    },

    /**
     * Days of week for recurring tasks.
     * 0 = Sunday, 6 = Saturday (matches JS Date.getDay()).
     */
    daysOfWeek: {
      type: [Number],
      default: [0, 1, 2, 3, 4, 5, 6], // every day by default
    },

    /** Soft-delete flag */
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

taskSchema.index({ elderId: 1, isActive: 1 });

const Task = mongoose.model('Task', taskSchema);
export default Task;
