'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * MoodScore model — daily aggregated mood score derived from AI chat sentiment analysis.
 * Unique per (elderId, date) — one score per day per elder.
 */
const moodScoreSchema = new Schema(
  {
    /** The elder this mood score belongs to */
    elderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'elderId is required'],
    },

    /** Calendar date string (YYYY-MM-DD) */
    date: {
      type: String,
      required: [true, 'date (YYYY-MM-DD) is required'],
    },

    /**
     * Normalised mood score 0–10.
     * Derived from the average VADER sentiment over the day, scaled to 0–10.
     */
    score: {
      type: Number,
      min: 0,
      max: 10,
      required: [true, 'score is required'],
    },

    /** Average raw VADER compound sentiment for the day (-1 to 1) */
    rawSentiment: {
      type: Number,
      default: null,
    },

    /** Total number of messages analysed to produce this score */
    messageCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// One mood score per elder per day
moodScoreSchema.index({ elderId: 1, date: 1 }, { unique: true });

const MoodScore = mongoose.model('MoodScore', moodScoreSchema);
export default MoodScore;
