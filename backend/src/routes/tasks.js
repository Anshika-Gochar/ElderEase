'use strict';
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import mongoose from 'mongoose';

import Task from '../models/Task.js';
import TaskCompletion from '../models/TaskCompletion.js';
import { authenticate } from '../middleware/auth.js';
import { emitToUser } from '../sockets/index.js';
import User from '../models/User.js';

const router = Router();
router.use(authenticate);

/**
 * Get today's date string YYYY-MM-DD.
 * @returns {string}
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get today's day-of-week index (0=Sun, 6=Sat).
 * @returns {number}
 */
function todayDow() {
  return new Date().getDay();
}

// ─── GET /api/tasks ───────────────────────────────────────────────────────────
/**
 * @route  GET /api/tasks
 * @desc   Get all active tasks for the elder (today's recurring tasks with completion status)
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const elderId = req.user.role === 'elder' ? req.user.id : req.query.elderId;
    if (!elderId) return res.status(400).json({ error: 'elderId required for caregivers' });

    const dow = todayDow();
    const today = todayStr();

    // Tasks that apply today (active + recurring on this day, or non-recurring)
    const tasks = await Task.find({
      elderId,
      isActive: true,
      $or: [
        { isRecurring: true, daysOfWeek: dow },
        { isRecurring: false },
      ],
    }).lean();

    // Get completions for today
    const taskIds = tasks.map((t) => t._id);
    const completions = await TaskCompletion.find({
      taskId: { $in: taskIds },
      elderId,
      date: today,
    }).lean();

    const completedSet = new Set(completions.map((c) => c.taskId.toString()));

    // Merge completion status into task objects
    const tasksWithStatus = tasks.map((t) => ({
      ...t,
      completedToday: completedSet.has(t._id.toString()),
    }));

    return res.json(tasksWithStatus);
  } catch (err) {
    console.error('[Tasks/GET]', err);
    return res.status(500).json({ error: 'Could not fetch tasks' });
  }
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
/**
 * @route  POST /api/tasks
 * @desc   Create a new task for an elder
 * @access Private
 */
router.post(
  '/',
  [
    body('elderId').if(body('elderId').exists()).isMongoId(),
    body('title').trim().notEmpty().withMessage('title is required'),
    body('category')
      .optional()
      .isIn(['exercise', 'health', 'social', 'medication', 'other']),
    body('scheduledTime').optional().trim(),
    body('isRecurring').optional().isBoolean(),
    body('daysOfWeek').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const elderId = req.user.role === 'elder' ? req.user.id : req.body.elderId;
      if (!elderId) return res.status(400).json({ error: 'elderId is required for caregivers' });

      const task = await Task.create({
        ...req.body,
        elderId,
        createdBy: req.user.id,
      });
      return res.status(201).json(task);
    } catch (err) {
      console.error('[Tasks/POST]', err);
      return res.status(500).json({ error: 'Could not create task' });
    }
  }
);

// ─── PATCH /api/tasks/:id ─────────────────────────────────────────────────────
/**
 * @route  PATCH /api/tasks/:id
 * @desc   Update a task
 * @access Private
 */
router.patch(
  '/:id',
  [
    body('title').optional().trim().notEmpty(),
    body('category').optional().isIn(['exercise', 'health', 'social', 'medication', 'other']),
    body('isRecurring').optional().isBoolean(),
    body('daysOfWeek').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      const task = await Task.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true }
      );
      if (!task) return res.status(404).json({ error: 'Task not found' });
      return res.json(task);
    } catch (err) {
      console.error('[Tasks/PATCH:id]', err);
      return res.status(500).json({ error: 'Could not update task' });
    }
  }
);

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────
/**
 * @route  DELETE /api/tasks/:id
 * @desc   Soft-delete a task (sets isActive=false)
 * @access Private
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }
    const task = await Task.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return res.json({ message: 'Task deactivated', id: task._id });
  } catch (err) {
    console.error('[Tasks/DELETE:id]', err);
    return res.status(500).json({ error: 'Could not delete task' });
  }
});

// ─── POST /api/tasks/:id/complete ─────────────────────────────────────────────
/**
 * @route  POST /api/tasks/:id/complete
 * @desc   Mark a task as completed for today. Emits 'task:completed' socket event.
 * @access Private
 */
router.post('/:id/complete', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const elderId = req.user.role === 'elder' ? req.user.id : task.elderId.toString();
    const today = todayStr();

    let completion;
    try {
      completion = await TaskCompletion.create({
        taskId: task._id,
        elderId,
        date: today,
        completedAt: new Date(),
      });
    } catch (dupErr) {
      // Duplicate completion for today — not an error, return existing
      completion = await TaskCompletion.findOne({ taskId: task._id, elderId, date: today });
      return res.json({ message: 'Already completed today', completion });
    }

    // Emit socket event to elder and caregivers
    emitToUser(elderId, 'task:completed', {
      taskId: task._id,
      taskTitle: task.title,
      completedAt: completion.completedAt,
    });

    const elder = await User.findById(elderId).lean();
    if (elder?.linkedCaregivers) {
      elder.linkedCaregivers.forEach((cgId) => {
        emitToUser(cgId.toString(), 'task:completed', {
          taskId: task._id,
          taskTitle: task.title,
          completedAt: completion.completedAt,
          elderName: elder.name,
          elderId,
        });
      });
    }

    return res.status(201).json({ message: 'Task completed', completion });
  } catch (err) {
    console.error('[Tasks/complete]', err);
    return res.status(500).json({ error: 'Could not complete task' });
  }
});

// Helper for calculating streak
async function calculateStreak(elderId, res) {
  // Get distinct completion dates, sorted descending
  const completions = await TaskCompletion.find({ elderId })
    .distinct('date');
  const dates = completions.sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) return res.json({ streak: 0, lastCompletedDate: null });

  let streak = 0;
  const today = todayStr();
  
  // Get yesterday's date string YYYY-MM-DD
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let cursor;
  if (dates.includes(today)) {
    cursor = new Date(today);
  } else if (dates.includes(yesterdayStr)) {
    cursor = new Date(yesterdayStr);
  } else {
    return res.json({ streak: 0, lastCompletedDate: dates[0] });
  }

  for (const date of dates) {
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (date === cursorStr) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (date > cursorStr) {
      continue;
    } else {
      break;
    }
  }

  return res.json({ streak, lastCompletedDate: dates[0] });
}

// ─── GET /api/tasks/streak ────────────────────────────────────────────────────
/**
 * @route  GET /api/tasks/streak
 * @desc   Calculate the current consecutive-day streak for the logged-in elder
 * @access Private
 */
router.get('/streak', async (req, res) => {
  try {
    const elderId = req.user.role === 'elder' ? req.user.id : req.query.elderId;
    if (!elderId) {
      return res.status(400).json({ error: 'elderId is required for caregivers' });
    }
    return await calculateStreak(elderId, res);
  } catch (err) {
    console.error('[Tasks/streak GET]', err);
    return res.status(500).json({ error: 'Could not calculate streak' });
  }
});

// ─── GET /api/tasks/streak/:elderId ───────────────────────────────────────────
/**
 * @route  GET /api/tasks/streak/:elderId
 * @desc   Calculate the current consecutive-day streak for a specific elder
 * @access Private
 */
router.get('/streak/:elderId', async (req, res) => {
  try {
    const { elderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(elderId)) {
      return res.status(400).json({ error: 'Invalid elderId' });
    }
    return await calculateStreak(elderId, res);
  } catch (err) {
    console.error('[Tasks/streak/:elderId GET]', err);
    return res.status(500).json({ error: 'Could not calculate streak' });
  }
});

export default router;
