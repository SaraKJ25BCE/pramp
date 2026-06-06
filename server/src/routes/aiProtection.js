/**
 * AI Protection Routes
 * 
 * Endpoints for AI training protection, access control, and monitoring.
 * 
 * POST   /api/ai-protection/access-token          - Generate AI access token
 * GET    /api/ai-protection/access-tokens/:stampId - Get all tokens for stamp
 * POST   /api/ai-protection/verify-token          - Verify token (public)
 * DELETE /api/ai-protection/access-token/:tokenId - Revoke token
 * 
 * POST   /api/ai-protection/registry-monitor      - Enable registry monitoring
 * POST   /api/ai-protection/scan/:stampId         - Scan AI registries
 * GET    /api/ai-protection/detections/:stampId   - Get detection results
 * POST   /api/ai-protection/report-detection/:detectionId - Report to platform
 * DELETE /api/ai-protection/registry-monitor/:stampId - Disable monitoring
 * 
 * GET    /api/ai-protection/analysis/:stampId     - Analyze dataset usage
 * GET    /api/ai-protection/history/:stampId      - Get detection history
 */

const express = require('express');
const router = express.Router();
const authOrApiKey = require('../middleware/authOrApiKey');
const { userFromPassport } = require('../middleware/userFromPassport');

const AIAccessControl = require('../services/aiAccessControl');
const AIRegistryMonitor = require('../services/aiRegistryMonitor');
const AITrainingDetection = require('../services/aiTrainingDetection');
const { auditLog } = require('../services/auditLog');
const rateLimit = require('express-rate-limit');

// Apply rate limiting
const aiProtectionLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 }); // 5 per minute
const verifyTokenLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

/**
 * POST /api/ai-protection/access-token
 * Generate AI access token for a stamp
 */
router.post(
  '/access-token',
  authOrApiKey,
  userFromPassport,
  aiProtectionLimiter,
  async (req, res) => {
    try {
      const { stampId, licenseType = 'all-rights-reserved', restrictions = {} } = req.body;
      const passportId = req.passport.id;

      if (!stampId) {
        return res.status(400).json({ error: 'stampId required' });
      }

      const token = await AIAccessControl.generateAccessToken(
        stampId,
        'license_verification',
        licenseType,
        restrictions,
        passportId
      );

      return res.json({
        success: true,
        token,
        message: 'Save this token securely. It will not be shown again.'
      });
    } catch (error) {
      console.error('[AI Protection] Token generation error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

/**
 * GET /api/ai-protection/access-tokens/:stampId
 * Get all access tokens for a stamp
 */
router.get(
  '/access-tokens/:stampId',
  authOrApiKey,
  userFromPassport,
  async (req, res) => {
    try {
      const { stampId } = req.params;
      const passportId = req.passport.id;

      const tokens = await AIAccessControl.getStampTokens(stampId, passportId);

      return res.json({
        success: true,
        stampId,
        tokens,
        count: tokens.length
      });
    } catch (error) {
      console.error('[AI Protection] Get tokens error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

/**
 * POST /api/ai-protection/verify-token
 * Verify AI access token (PUBLIC - no auth required)
 * Used by AI platforms to check licensing
 */
router.post(
  '/verify-token',
  verifyTokenLimiter, // More lenient for platform calls
  async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          valid: false,
          reason: 'Token required'
        });
      }

      const result = await AIAccessControl.verifyAccessToken(token);

      return res.json(result);
    } catch (error) {
      console.error('[AI Protection] Token verification error:', error);
      return res.json({
        valid: false,
        reason: 'Verification error'
      });
    }
  }
);

/**
 * DELETE /api/ai-protection/access-token/:tokenId
 * Revoke an access token
 */
router.delete(
  '/access-token/:tokenId',
  authOrApiKey,
  userFromPassport,
  async (req, res) => {
    try {
      const { tokenId } = req.params;
      const { reason } = req.body;
      const passportId = req.passport.id;

      const result = await AIAccessControl.revokeAccessToken(
        tokenId,
        passportId,
        reason
      );

      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[AI Protection] Revoke token error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

/**
 * POST /api/ai-protection/registry-monitor
 * Enable AI registry monitoring for a stamp
 */
router.post(
  '/registry-monitor',
  authOrApiKey,
  userFromPassport,
  aiProtectionLimiter,
  async (req, res) => {
    try {
      const { stampId, platforms, scanFrequency = 'weekly' } = req.body;
      const passportId = req.passport.id;

      if (!stampId) {
        return res.status(400).json({ error: 'stampId required' });
      }

      const monitoring = await AIRegistryMonitor.enableMonitoring(
        stampId,
        passportId,
        platforms,
        scanFrequency
      );

      return res.json({
        success: true,
        monitoring,
        message: 'AI registry monitoring enabled'
      });
    } catch (error) {
      console.error('[AI Protection] Enable monitoring error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

/**
 * POST /api/ai-protection/scan/:stampId
 * Scan AI registries for unauthorized usage
 */
router.post(
  '/scan/:stampId',
  authOrApiKey,
  userFromPassport,
  async (req, res) => {
    try {
      const { stampId } = req.params;
      const passportId = req.passport.id;

      const result = await AIRegistryMonitor.scanRegistries(stampId, passportId);

      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[AI Protection] Scan error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

/**
 * GET /api/ai-protection/detections/:stampId
 * Get detection results from AI registries
 */
router.get(
  '/detections/:stampId',
  authOrApiKey,
  userFromPassport,
  async (req, res) => {
    try {
      const { stampId } = req.params;
      const passportId = req.passport.id;

      // Verify ownership
      const { prisma } = require('../config/prisma');
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { passportId: true }
      });

      if (!stamp || stamp.passportId !== passportId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const detections = await prisma.aITrainingDetection.findMany({
        where: { stampId },
        orderBy: { detectedAt: 'desc' },
        include: {
          registryMonitor: {
            select: { scanFrequency: true, lastScanAt: true }
          }
        }
      });

      return res.json({
        success: true,
        stampId,
        detections,
        count: detections.length
      });
    } catch (error) {
      console.error('[AI Protection] Get detections error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/ai-protection/report-detection/:detectionId
 * Report unauthorized training to AI platform
 */
router.post(
  '/report-detection/:detectionId',
  authOrApiKey,
  userFromPassport,
  aiProtectionLimiter,
  async (req, res) => {
    try {
      const { detectionId } = req.params;
      const { reportType = 'unauthorized_use' } = req.body;

      const result = await AITrainingDetection.reportToAIPlatform(
        detectionId,
        reportType
      );

      return res.json({
        success: true,
        ...result,
        message: 'Report submitted to platform'
      });
    } catch (error) {
      console.error('[AI Protection] Report detection error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

/**
 * DELETE /api/ai-protection/registry-monitor/:stampId
 * Disable AI registry monitoring
 */
router.delete(
  '/registry-monitor/:stampId',
  authOrApiKey,
  userFromPassport,
  async (req, res) => {
    try {
      const { stampId } = req.params;
      const passportId = req.passport.id;

      const result = await AIRegistryMonitor.disableMonitoring(stampId, passportId);

      return res.json({
        success: true,
        ...result,
        message: 'AI registry monitoring disabled'
      });
    } catch (error) {
      console.error('[AI Protection] Disable monitoring error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

/**
 * GET /api/ai-protection/analysis/:stampId
 * Analyze dataset usage and AI training
 */
router.get(
  '/analysis/:stampId',
  authOrApiKey,
  userFromPassport,
  async (req, res) => {
    try {
      const { stampId } = req.params;
      const passportId = req.passport.id;

      const analysis = await AITrainingDetection.analyzeDatasetUsage(
        stampId,
        passportId
      );

      return res.json({
        success: true,
        ...analysis
      });
    } catch (error) {
      console.error('[AI Protection] Analysis error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

/**
 * GET /api/ai-protection/history/:stampId
 * Get complete detection and audit history
 */
router.get(
  '/history/:stampId',
  authOrApiKey,
  userFromPassport,
  async (req, res) => {
    try {
      const { stampId } = req.params;
      const passportId = req.passport.id;

      const history = await AITrainingDetection.getDetectionHistory(
        stampId,
        passportId
      );

      return res.json({
        success: true,
        stampId,
        ...history
      });
    } catch (error) {
      console.error('[AI Protection] History error:', error);
      return res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        error: error.message
      });
    }
  }
);

module.exports = router;
