// backend/src/models/User.js  MODIFIED
'use strict';
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * User model — represents elders, caregivers, and admins.
 *
 * Phase 5 additions:
 *   avatarUrl          — local upload path for profile photo
 *   notificationPrefs  — per-user toggle for email/SMS channels
 */
const userSchema = new Schema(
  {
    /** Firebase UID — optional (only set when using Firebase auth) */
    firebaseUid: {
      type:   String,
      unique: true,
      sparse: true,
    },

    /** Primary contact / login email */
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
    },

    /** Hashed password for local auth fallback (bcryptjs) */
    passwordHash: {
      type: String,
    },

    /** Display name */
    name: {
      type:     String,
      required: [true, 'Name is required'],
      trim:     true,
    },

    /** User role determines access and UI experience */
    role: {
      type:    String,
      enum:    ['elder', 'caregiver', 'admin'],
      default: 'elder',
    },

    /** Primary phone number for SMS/voice alerts (E.164 format) */
    phone: {
      type: String,
      trim: true,
    },

    /** Profile photo URL (legacy — kept for backward compat) */
    profilePhoto: {
      type: String,
    },

    /**
     * Local avatar upload path (Phase 5).
     * Set to '/uploads/avatars/<filename>' after upload.
     */
    avatarUrl: {
      type:    String,
      default: null,
    },

    /** For caregivers: array of elder User IDs they manage */
    linkedElders: [
      {
        type: Schema.Types.ObjectId,
        ref:  'User',
      },
    ],

    /** For elders: array of caregiver User IDs watching over them */
    linkedCaregivers: [
      {
        type: Schema.Types.ObjectId,
        ref:  'User',
      },
    ],

    /** Firebase Cloud Messaging token for push notifications */
    fcmToken: {
      type: String,
    },

    /**
     * Per-user notification channel preferences (Phase 5).
     * All default true — safe to send until user opts out.
     * Checked in ai.js anomaly detection and reminderJob.js.
     */
    notificationPrefs: {
      emailAnomalies: { type: Boolean, default: true },
      smsAnomalies:   { type: Boolean, default: true },
      emailDigest:    { type: Boolean, default: true },
    },

    /** Soft-delete / account suspension flag */
    isActive: {
      type:    Boolean,
      default: true,
    },

    /** Timestamp of last API activity */
    lastSeen: {
      type: Date,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ role: 1 });

const User = mongoose.model('User', userSchema);
export default User;
