'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ChatMessage model — stores AI companion conversation history for each user.
 */
const chatMessageSchema = new Schema(
  {
    /** The user who sent or received this message */
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    /** Whether this message was from the elder or the AI assistant */
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: [true, 'role is required'],
    },

    /** Full text content of the message */
    content: {
      type: String,
      required: [true, 'content is required'],
    },

    /**
     * VADER compound sentiment score (-1 to 1).
     * Populated by the AI service; null until analysed.
     */
    sentimentScore: {
      type: Number,
      min: -1,
      max: 1,
      default: null,
    },
  },
  { timestamps: true }
);

chatMessageSchema.index({ userId: 1, createdAt: -1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
export default ChatMessage;
