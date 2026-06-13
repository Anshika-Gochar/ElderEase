// backend/src/routes/reports.js  NEW
'use strict';

/**
 * Health report export routes.
 *
 * GET /api/reports/health/:elderId?format=pdf|csv&days=30
 *
 * Generates a PDF or CSV health report for a given elder covering the
 * requested number of days. Only linked caregivers may download reports.
 *
 * Dependencies:
 *   pdfkit    — streaming PDF generation
 *   papaparse — CSV unparse
 */

import { Router }      from 'express';
import { param, query } from 'express-validator';
import PDFDocument     from 'pdfkit';
import Papa            from 'papaparse';

import { authenticate }  from '../middleware/auth.js';
import { requireRole }   from '../middleware/roleGuard.js';
import User              from '../models/User.js';
import Medication        from '../models/Medication.js';
import DoseLog           from '../models/DoseLog.js';
import MoodScore         from '../models/MoodScore.js';
import AnomalyFlag       from '../models/AnomalyFlag.js';
import Alert             from '../models/Alert.js';
import TaskCompletion    from '../models/TaskCompletion.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('caregiver', 'admin'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return YYYY-MM-DD strings for the last N days (oldest first) */
function buildDateRange(days) {
  const dates = [];
  const now   = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Verify caregiver is linked to the elder */
async function assertLinked(caregiverId, elderId, res) {
  const cg = await User.findById(caregiverId).select('linkedElders').lean();
  const isLinked = cg?.linkedElders?.map(String).includes(elderId);
  if (!isLinked) {
    res.status(403).json({ error: 'Not authorised to view this elder\'s reports' });
    return false;
  }
  return true;
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchReportData(elderId, days) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const [
    elder,
    medications,
    doseLogs,
    moodScores,
    anomalyFlags,
    sosAlerts,
    taskCompletions,
  ] = await Promise.all([
    User.findById(elderId).select('name email phone createdAt avatarUrl').lean(),
    Medication.find({ elderId, isActive: true }).lean(),
    DoseLog.find({ elderId, createdAt: { $gte: start } }).lean(),
    MoodScore.find({ elderId, date: { $gte: start.toISOString().slice(0, 10) } })
             .sort({ date: 1 }).lean(),
    AnomalyFlag.find({ elderId, createdAt: { $gte: start } }).sort({ createdAt: -1 }).lean(),
    Alert.find({ elderId, type: 'sos', createdAt: { $gte: start } }).lean(),
    TaskCompletion.find({ elderId, createdAt: { $gte: start } }).lean(),
  ]);

  return { elder, medications, doseLogs, moodScores, anomalyFlags, sosAlerts, taskCompletions };
}

// ─── GET /api/reports/health/:elderId ────────────────────────────────────────
/**
 * @route  GET /api/reports/health/:elderId
 * @query  format  'pdf' (default) | 'csv'
 * @query  days    Number of days to cover (default 30, max 90)
 * @desc   Download a health report for the specified elder.
 * @access Private — caregiver or admin (must be linked)
 */
router.get(
  '/health/:elderId',
  [
    param('elderId').isMongoId().withMessage('Invalid elderId'),
    query('format').optional().isIn(['pdf', 'csv']).withMessage('format must be pdf or csv'),
    query('days').optional().isInt({ min: 1, max: 90 }).withMessage('days must be 1-90'),
  ],
  async (req, res) => {
    try {
      const { elderId } = req.params;
      const format      = req.query.format || 'pdf';
      const days        = parseInt(req.query.days, 10) || 30;

      // Access control
      if (req.user.role === 'caregiver') {
        const allowed = await assertLinked(req.user.id, elderId, res);
        if (!allowed) return;
      }

      const data = await fetchReportData(elderId, days);

      if (!data.elder) {
        return res.status(404).json({ error: 'Elder not found' });
      }

      const safeDate = new Date().toISOString().slice(0, 10);
      const safeName = (data.elder.name || 'Elder').replace(/\s+/g, '-');

      if (format === 'csv') {
        return generateCSV(res, data, days, safeName, safeDate);
      }
      return generatePDF(res, data, days, safeName, safeDate);

    } catch (err) {
      console.error('[Reports/health]', err);
      return res.status(500).json({ error: 'Could not generate report' });
    }
  }
);

// ─── PDF Generator ────────────────────────────────────────────────────────────

function generatePDF(res, data, days, safeName, safeDate) {
  const { elder, medications, doseLogs, moodScores, anomalyFlags, sosAlerts } = data;

  const filename = `ElderEase-Report-${safeName}-${safeDate}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  const BRAND  = '#4A9EE8';
  const GREEN  = '#2BBD8E';
  const RED    = '#EF4444';
  const AMBER  = '#F5A623';
  const GREY   = '#718096';
  const DARK   = '#1A202C';
  const W      = doc.page.width - 100; // usable width

  // ── Header ──
  doc.rect(0, 0, doc.page.width, 80).fill(BRAND);
  doc.fillColor('#fff').fontSize(22).font('Helvetica-Bold')
     .text('ElderEase Health Report', 50, 22);
  doc.fontSize(11).font('Helvetica')
     .text('AI-Powered Elderly Care Platform', 50, 50);
  doc.moveDown(3);

  // ── Summary box ──
  doc.fillColor(DARK).fontSize(16).font('Helvetica-Bold')
     .text(`Patient: ${elder.name}`, 50, 100);
  doc.fontSize(11).font('Helvetica').fillColor(GREY)
     .text(`Report Period: Last ${days} days  |  Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`, 50, 120);
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor(BRAND).lineWidth(2).stroke();
  doc.moveDown(1);

  // ── Stats row ──
  const totalDoses    = doseLogs.length;
  const takenDoses    = doseLogs.filter((d) => d.status === 'taken').length;
  const adherencePct  = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : null;
  const avgMood       = moodScores.length
    ? (moodScores.reduce((s, m) => s + m.score, 0) / moodScores.length).toFixed(1)
    : null;

  const statStartY = doc.y + 8;
  const colW       = W / 4;

  const stats = [
    { label: 'Adherence', value: adherencePct != null ? `${adherencePct}%` : 'N/A' },
    { label: 'Avg Mood',  value: avgMood != null ? `${avgMood}/10` : 'N/A' },
    { label: 'Anomalies', value: anomalyFlags.length.toString() },
    { label: 'SOS Events',value: data.sosAlerts.length.toString() },
  ];

  stats.forEach((s, i) => {
    const x = 50 + i * colW;
    doc.roundedRect(x, statStartY, colW - 10, 60, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor(BRAND).fontSize(22).font('Helvetica-Bold')
       .text(s.value, x + 5, statStartY + 10, { width: colW - 20, align: 'center' });
    doc.fillColor(GREY).fontSize(10).font('Helvetica')
       .text(s.label, x + 5, statStartY + 38, { width: colW - 20, align: 'center' });
  });

  doc.y = statStartY + 72;
  doc.moveDown(1);

  // ─── Section 1: Medication Adherence ──────────────────────────────────────
  doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold')
     .text('Section 1 — Medication Adherence', 50, doc.y);
  doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).strokeColor(BRAND).lineWidth(1).stroke();
  doc.moveDown(0.5);

  if (medications.length === 0) {
    doc.fillColor(GREY).fontSize(11).font('Helvetica').text('No active medications.', 50);
  } else {
    // Table header
    const cols = [0, W * 0.35, W * 0.55, W * 0.7, W * 0.85];
    const headers = ['Medication', 'Dose', 'Taken', 'Missed', 'Adh%'];
    doc.fillColor('#fff');
    doc.rect(50, doc.y, W, 20).fill('#4A9EE8');
    headers.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
         .text(h, 54 + cols[i], doc.y - 16, { width: (cols[i + 1] || W) - cols[i], align: 'left' });
    });
    doc.moveDown(0.3);

    medications.forEach((med, idx) => {
      const medLogs = doseLogs.filter((d) => d.medicationId?.toString() === med._id.toString());
      const taken   = medLogs.filter((d) => d.status === 'taken').length;
      const missed  = medLogs.filter((d) => d.status === 'missed').length;
      const pct     = medLogs.length > 0 ? Math.round((taken / medLogs.length) * 100) : null;

      const rowY    = doc.y;
      const rowBg   = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(50, rowY, W, 18).fill(rowBg);

      const rowData = [med.name, med.dose, taken.toString(), missed.toString(), pct != null ? `${pct}%` : 'N/A'];
      rowData.forEach((cell, i) => {
        doc.fillColor(DARK).fontSize(10).font('Helvetica')
           .text(cell, 54 + cols[i], rowY + 4, { width: (cols[i + 1] || W) - cols[i], align: 'left' });
      });
      doc.y = rowY + 18;
    });
  }

  doc.moveDown(1.5);

  // ─── Section 2: Mood Trend ────────────────────────────────────────────────
  if (doc.y > 650) doc.addPage();

  doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold')
     .text('Section 2 — Mood Trend', 50, doc.y);
  doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).strokeColor(BRAND).lineWidth(1).stroke();
  doc.moveDown(0.5);

  if (moodScores.length === 0) {
    doc.fillColor(GREY).fontSize(11).font('Helvetica').text('No mood data recorded in this period.', 50);
  } else {
    const best  = moodScores.reduce((a, b) => a.score > b.score ? a : b);
    const worst = moodScores.reduce((a, b) => a.score < b.score ? a : b);

    doc.fillColor(DARK).fontSize(11).font('Helvetica')
       .text(`Average mood score: ${avgMood}/10`, 50)
       .text(`Best day: ${best.date} (${best.score}/10)`)
       .text(`Lowest day: ${worst.date} (${worst.score}/10)`)
       .text(`Days with data: ${moodScores.length} of ${days}`);
  }

  doc.moveDown(1.5);

  // ─── Section 3: Anomaly Flags ─────────────────────────────────────────────
  if (doc.y > 630) doc.addPage();

  doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold')
     .text('Section 3 — Anomaly Flags', 50, doc.y);
  doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).strokeColor(BRAND).lineWidth(1).stroke();
  doc.moveDown(0.5);

  if (anomalyFlags.length === 0) {
    doc.fillColor(GREEN).fontSize(11).font('Helvetica')
       .text('No anomaly flags detected in this period.', 50);
  } else {
    const flagCols = [0, W * 0.4, W * 0.6, W * 0.82];
    const flagHeaders = ['Anomaly Type', 'Severity', 'Detected', 'Resolved'];
    doc.rect(50, doc.y, W, 20).fill(BRAND);
    flagHeaders.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
         .text(h, 54 + flagCols[i], doc.y - 16, { width: (flagCols[i + 1] || W) - flagCols[i] });
    });
    doc.moveDown(0.3);

    anomalyFlags.forEach((f, idx) => {
      if (doc.y > 700) doc.addPage();
      const rowY   = doc.y;
      const rowBg  = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(50, rowY, W, 18).fill(rowBg);
      const sevColour = f.severity === 'high' ? RED : AMBER;
      const cells = [
        f.type?.replace(/_/g, ' ') || 'Unknown',
        f.severity?.toUpperCase() || '',
        new Date(f.createdAt).toLocaleDateString('en-IN'),
        f.resolvedAt ? new Date(f.resolvedAt).toLocaleDateString('en-IN') : 'Pending',
      ];
      cells.forEach((cell, i) => {
        const colour = i === 1 ? sevColour : DARK;
        doc.fillColor(colour).fontSize(10).font(i === 1 ? 'Helvetica-Bold' : 'Helvetica')
           .text(cell, 54 + flagCols[i], rowY + 4, { width: (flagCols[i + 1] || W) - flagCols[i] });
      });
      doc.y = rowY + 18;
    });
  }

  doc.moveDown(1.5);

  // ─── Section 4: SOS Events ────────────────────────────────────────────────
  if (doc.y > 680) doc.addPage();

  doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold')
     .text('Section 4 — SOS Events', 50, doc.y);
  doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).strokeColor(BRAND).lineWidth(1).stroke();
  doc.moveDown(0.5);

  doc.fillColor(data.sosAlerts.length > 0 ? RED : GREEN).fontSize(11).font('Helvetica')
     .text(`Total SOS alerts triggered: ${data.sosAlerts.length}`, 50);

  if (data.sosAlerts.length > 0) {
    data.sosAlerts.forEach((sos) => {
      doc.fillColor(DARK).fontSize(10)
         .text(`  • ${new Date(sos.createdAt).toLocaleString('en-IN')} — ${sos.message || 'SOS triggered'} ${sos.isRead ? '(Resolved)' : '(Pending)'}`, 50);
    });
  }

  // ── Footer ──
  doc.fontSize(9).fillColor(GREY)
     .text(
       `Generated by ElderEase on ${new Date().toLocaleString('en-IN')}`,
       50, doc.page.height - 40,
       { align: 'center', width: W }
     );

  doc.end();
}

// ─── CSV Generator ────────────────────────────────────────────────────────────

function generateCSV(res, data, days, safeName, safeDate) {
  const { doseLogs, moodScores, anomalyFlags, sosAlerts, taskCompletions } = data;

  const filename = `ElderEase-${safeName}-${safeDate}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const dateRange = buildDateRange(days);

  // Index data by date for O(1) lookup
  const moodByDate   = Object.fromEntries(moodScores.map((m) => [m.date, m]));
  const anomalyCount = {};
  anomalyFlags.forEach((f) => {
    const d = new Date(f.createdAt).toISOString().slice(0, 10);
    anomalyCount[d] = (anomalyCount[d] || 0) + 1;
  });
  const sosCount = {};
  sosAlerts.forEach((s) => {
    const d = new Date(s.createdAt).toISOString().slice(0, 10);
    sosCount[d] = (sosCount[d] || 0) + 1;
  });
  const tasksByDate = {};
  taskCompletions.forEach((t) => {
    const d = t.date || new Date(t.createdAt).toISOString().slice(0, 10);
    tasksByDate[d] = (tasksByDate[d] || 0) + 1;
  });

  const rows = dateRange.map((date) => {
    const dayLogs     = doseLogs.filter((d) => new Date(d.scheduledTime).toISOString().slice(0, 10) === date);
    const taken       = dayLogs.filter((d) => d.status === 'taken').length;
    const scheduled   = dayLogs.length;
    const adhPct      = scheduled > 0 ? Math.round((taken / scheduled) * 100) : '';
    const mood        = moodByDate[date];

    return {
      date,
      moodScore:         mood?.score ?? '',
      sentimentLabel:    mood?.sentimentLabel ?? '',
      dosesTaken:        taken,
      dosesScheduled:    scheduled,
      adherencePct:      adhPct,
      tasksCompleted:    tasksByDate[date] || 0,
      anomalyFlags:      anomalyCount[date] || 0,
      sosEvents:         sosCount[date] || 0,
    };
  });

  const csv = Papa.unparse(rows, { header: true });
  return res.send(csv);
}

export default router;
