// backend/src/routes/notes.js  NEW
'use strict';

/**
 * Caregiver notes routes — CRUD for clinical observations on elders.
 *
 * POST   /api/notes              — create a note
 * GET    /api/notes/:elderId     — list notes for an elder
 * DELETE /api/notes/:noteId      — delete own note
 *
 * All routes require authentication + caregiver role.
 * Access is verified against linkedElders before any operation.
 */

import { Router }                  from 'express';
import { body, param, query, validationResult } from 'express-validator';

import { authenticate }   from '../middleware/auth.js';
import { requireRole }    from '../middleware/roleGuard.js';
import User               from '../models/User.js';
import CaregiverNote      from '../models/CaregiverNote.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('caregiver', 'admin'));

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Verify this caregiver is linked to the elder. Returns false + sends 403 if not. */
async function assertLinked(caregiverId, elderId, res) {
  const cg = await User.findById(caregiverId).select('linkedElders').lean();
  const ok = cg?.linkedElders?.map(String).includes(elderId);
  if (!ok) {
    res.status(403).json({ error: 'Not authorised — not linked to this elder' });
    return false;
  }
  return true;
}

// ─── POST /api/notes ──────────────────────────────────────────────────────────
/**
 * @route  POST /api/notes
 * @desc   Create a new caregiver note for an elder.
 * @access Private — caregiver or admin
 */
router.post(
  '/',
  [
    body('elderId').notEmpty().isMongoId().withMessage('Valid elderId is required'),
    body('content').trim().notEmpty().isLength({ max: 1000 })
      .withMessage('content is required (max 1000 chars)'),
    body('category')
      .optional()
      .isIn(['observation', 'concern', 'positive', 'general'])
      .withMessage('category must be one of: observation, concern, positive, general'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { elderId, content, category } = req.body;

      const allowed = await assertLinked(req.user.id, elderId, res);
      if (!allowed) return;

      const note = await CaregiverNote.create({
        caregiverId: req.user.id,
        elderId,
        content,
        category: category || 'general',
      });

      console.log(`[Notes/create] caregiverId=${req.user.id} elderId=${elderId} noteId=${note._id}`);
      return res.status(201).json(note);
    } catch (err) {
      console.error('[Notes/create]', err);
      return res.status(500).json({ error: 'Could not create note' });
    }
  }
);

// ─── GET /api/notes/:elderId ──────────────────────────────────────────────────
/**
 * @route  GET /api/notes/:elderId
 * @desc   List notes for an elder, newest first.
 * @query  category  Filter by category (optional)
 * @access Private — caregiver or admin (must be linked)
 */
router.get(
  '/:elderId',
  [
    param('elderId').isMongoId().withMessage('Invalid elderId'),
    query('category')
      .optional()
      .isIn(['observation', 'concern', 'positive', 'general'])
      .withMessage('Invalid category filter'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { elderId } = req.params;

      const allowed = await assertLinked(req.user.id, elderId, res);
      if (!allowed) return;

      const filter = { elderId };
      if (req.query.category) filter.category = req.query.category;

      const notes = await CaregiverNote.find(filter)
        .sort({ createdAt: -1 })
        .populate('caregiverId', 'name avatarUrl profilePhoto')
        .lean();

      return res.json(notes);
    } catch (err) {
      console.error('[Notes/list]', err);
      return res.status(500).json({ error: 'Could not fetch notes' });
    }
  }
);

// ─── DELETE /api/notes/:noteId ────────────────────────────────────────────────
/**
 * @route  DELETE /api/notes/:noteId
 * @desc   Delete a note. Only the note author can delete it.
 * @access Private — caregiver or admin
 */
router.delete(
  '/:noteId',
  [param('noteId').isMongoId().withMessage('Invalid noteId')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { noteId } = req.params;

      const note = await CaregiverNote.findById(noteId).lean();
      if (!note) return res.status(404).json({ error: 'Note not found' });

      // Only the author or an admin may delete
      if (
        req.user.role !== 'admin' &&
        note.caregiverId.toString() !== req.user.id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorised — you can only delete your own notes' });
      }

      await CaregiverNote.findByIdAndDelete(noteId);
      console.log(`[Notes/delete] noteId=${noteId} deleted by ${req.user.id}`);
      return res.json({ deleted: true, noteId });
    } catch (err) {
      console.error('[Notes/delete]', err);
      return res.status(500).json({ error: 'Could not delete note' });
    }
  }
);

export default router;
