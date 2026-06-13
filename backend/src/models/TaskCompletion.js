'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * TaskCompletion model — records each instance of a task being completed.
 * The compound index on (taskId, elderId, date) prevents duplicate completions
 * for the same task on the same day.
 */
const taskCompletionSchema = new Schema(
  {
    /** The task that was completed */
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'taskId is required'],
    },

    /** The elder who completed it */
    elderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'elderId is required'],
    },

    /** Exact timestamp of completion */
    completedAt: {
      type: Date,
      default: Date.now,
    },

    /** Calendar date string (YYYY-MM-DD) used for deduplication and streak calculation */
    date: {
      type: String,
      required: [true, 'date (YYYY-MM-DD) is required'],
    },
  },
  { timestamps: true }
);

// Prevent double-completion of the same task on the same day
taskCompletionSchema.index({ taskId: 1, elderId: 1, date: 1 }, { unique: true });
taskCompletionSchema.index({ elderId: 1, date: -1 });

const TaskCompletion = mongoose.model('TaskCompletion', taskCompletionSchema);
export default TaskCompletion;
