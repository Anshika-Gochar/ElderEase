'use strict';
import { Router } from 'express';
import mongoose from 'mongoose';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import User from '../models/User.js';
import Medication from '../models/Medication.js';
import DoseLog from '../models/DoseLog.js';
import Task from '../models/Task.js';
import TaskCompletion from '../models/TaskCompletion.js';
import MoodScore from '../models/MoodScore.js';
import AnomalyFlag from '../models/AnomalyFlag.js';
import ChatMessage from '../models/ChatMessage.js';
import { ensureTodayDoseLogs } from './medications.js';

const router = Router();
router.use(authenticate, requireRole('caregiver', 'admin'));

/**
 * Get today's date string YYYY-MM-DD.
 * @returns {string}
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ─── GET /api/dashboard/:elderId ─────────────────────────────────────────────
/**
 * @route  GET /api/dashboard/:elderId
 * @desc   Return comprehensive dashboard data for a caregiver viewing an elder.
 *         Aggregates: elder profile, today's medication adherence, 7-day mood
 *         scores, recent anomaly flags, task streak, today's tasks, and
 *         last chat message.
 * @access Private — caregiver, admin
 */
router.get('/:elderId', async (req, res) => {
  try {
    const { elderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(elderId)) {
      return res.status(400).json({ error: 'Invalid elderId' });
    }

    // Ensure today's DoseLogs are generated before stats are loaded
    await ensureTodayDoseLogs(elderId);

    // ── 1. Elder profile ──────────────────────────────────────────────────────
    const elder = await User.findById(elderId)
      .select('-passwordHash')
      .lean();
    if (!elder) return res.status(404).json({ error: 'Elder not found' });

    // ── 2. Today's medication adherence ──────────────────────────────────────
    const today = todayStr();
    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const todayEnd = new Date(`${today}T23:59:59.999Z`);

    const doseLogs = await DoseLog.find({
      elderId,
      scheduledTime: { $gte: todayStart, $lte: todayEnd },
    }).lean();

    const totalDoses = doseLogs.length;
    const takenDoses = doseLogs.filter((d) => d.status === 'taken').length;
    const adherencePercent = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : null;

    // ── 3. 7-day mood scores ──────────────────────────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    // NOTE: The Python AI service writes to the `mood_scores` collection
    // with { userId, date, score, ... }. Mongoose's MoodScore model maps to
    // `moodscores` (auto-pluralised) — a completely different collection.
    // We query `mood_scores` directly via the raw driver to find the real data.
    const moodCol = mongoose.connection.db.collection('mood_scores');
    const moodScoresRaw = await moodCol.find({
      userId: elderId,
      date: { $gte: sevenDaysAgoStr },
    })
      .sort({ date: 1 })
      .toArray();

    // Normalise to the shape the frontend expects: { date, score }
    const moodScores = moodScoresRaw.map((d) => ({
      date:         d.date,
      score:        d.score,
      rawSentiment: d.rawSentiment ?? null,
      messageCount: d.messageCount ?? 1,
    }));

    // ── 4. Recent anomaly flags ───────────────────────────────────────────────
    const anomalyFlags = await AnomalyFlag.find({
      elderId,
      resolvedAt: null,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // ── 5. Task streak ────────────────────────────────────────────────────────
    const allCompletionDates = await TaskCompletion.find({ elderId })
      .distinct('date');
    const sortedDates = allCompletionDates.sort((a, b) => b.localeCompare(a));

    let streak = 0;
    let cursor = new Date(today);
    for (const date of sortedDates) {
      const cursorStr = cursor.toISOString().slice(0, 10);
      if (date === cursorStr) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    // ── 6. Today's tasks with completion status ───────────────────────────────
    const dow = new Date().getDay();
    const tasks = await Task.find({
      elderId,
      isActive: true,
      $or: [
        { isRecurring: true, daysOfWeek: dow },
        { isRecurring: false },
      ],
    }).lean();

    const taskIds = tasks.map((t) => t._id);
    const todayCompletions = await TaskCompletion.find({
      taskId: { $in: taskIds },
      elderId,
      date: today,
    }).lean();

    const completedSet = new Set(todayCompletions.map((c) => c.taskId.toString()));
    const tasksWithStatus = tasks.map((t) => ({
      ...t,
      completedToday: completedSet.has(t._id.toString()),
    }));

    // ── 7. Last chat message ──────────────────────────────────────────────────
    const lastChat = await ChatMessage.findOne({ userId: elderId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      elder,
      medicationAdherence: {
        totalDoses,
        takenDoses,
        adherencePercent,
        doseLogs,
      },
      moodScores,
      anomalyFlags,
      taskStreak: streak,
      tasks: tasksWithStatus,
      lastChatMessage: lastChat,
    });
  } catch (err) {
    console.error('[Dashboard/:elderId]', err);
    return res.status(500).json({ error: 'Could not fetch dashboard data' });
  }
});

export default router;
