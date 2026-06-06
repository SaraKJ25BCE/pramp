/**
 * Deepfake & Manipulation Detection Service
 * 
 * Detects when protected works are modified, deepfaked, or manipulated.
 * 
 * Detection methods:
 * - Face/Object detection and verification
 * - Deepfake likelihood scoring (LSTM-based)
 * - Facial forensics (inconsistencies)
 * - Blur/Compression artifact analysis
 * - Comparison with original for edits
 * - AI-generated content detection
 * - Style transfer detection
 * 
 * Integrates with:
 * - OpenCV + Dlib (face detection)
 * - MediaPipe (hand pose/mesh)
 * - TensorFlow models (deepfake detection)
 * - PyTorch models (forensics)
 * - Custom YOLO models (object detection)
 */

const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../config/prisma');
const { auditLog } = require('./auditLog');

class DeepfakeDetection {
  // Detection service endpoints
  static DETECTION_SERVICE = process.env.DEEPFAKE_DETECTION_SERVICE_URL || 'http://localhost:5000';

  /**
   * Analyze image/video for deepfakes and manipulations
   */
  static async analyzeForDeepfakes(stampId, passportId, fileBuffer, fileType = 'image') {
    try {
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: {
          passportId: true,
          originalHash: true,
          pHash: true,
          fileName: true,
          category: true,
          embedding: true
        }
      });

      if (!stamp || stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      const analysis = {
        stampId,
        analysedAt: new Date(),
        fileType,
        results: {
          isDeepfake: false,
          manipulationDetected: false,
          aiGenerated: false,
          confidence: 0,
          details: []
        }
      };

      // Route to appropriate detector
      if (fileType === 'image') {
        const imageAnalysis = await this.analyzeImageDeepfake(fileBuffer, stamp);
        analysis.results = { ...analysis.results, ...imageAnalysis };
      } else if (fileType === 'video') {
        const videoAnalysis = await this.analyzeVideoDeepfake(fileBuffer, stamp);
        analysis.results = { ...analysis.results, ...videoAnalysis };
      }

      // Log if manipulation detected
      if (analysis.results.manipulationDetected || analysis.results.isDeepfake) {
        await this.createManipulationAlert(stampId, analysis.results);
      }

      return analysis;
    } catch (error) {
      console.error('[DeepfakeDetection] Analysis error:', error);
      throw error;
    }
  }

  /**
   * Analyze image for deepfakes
   */
  static async analyzeImageDeepfake(fileBuffer, stamp) {
    try {
      const results = {
        isDeepfake: false,
        manipulationDetected: false,
        aiGenerated: false,
        confidence: 0,
        details: [],
        faceDetections: [],
        anomalies: []
      };

      // Check 1: Face consistency
      const faceAnalysis = await this.analyzeFaceConsistency(fileBuffer, stamp);
      if (faceAnalysis.anomalies.length > 0) {
        results.manipulationDetected = true;
        results.confidence = Math.max(results.confidence, faceAnalysis.confidence);
        results.anomalies.push(...faceAnalysis.anomalies);
        results.faceDetections = faceAnalysis.faces;
      }

      // Check 2: Deepfake likelihood
      const deepfakeScore = await this.scoreDeepfakeLikelihood(fileBuffer);
      if (deepfakeScore.likelihood > 0.6) {
        results.isDeepfake = true;
        results.confidence = Math.max(results.confidence, deepfakeScore.likelihood);
        results.details.push({
          type: 'deepfake_detected',
          score: deepfakeScore.likelihood,
          indicators: deepfakeScore.indicators
        });
      }

      // Check 3: AI-generated content
      const aiGenScore = await this.scoreAIGeneration(fileBuffer);
      if (aiGenScore.likelihood > 0.65) {
        results.aiGenerated = true;
        results.manipulationDetected = true;
        results.confidence = Math.max(results.confidence, aiGenScore.likelihood);
        results.details.push({
          type: 'ai_generated',
          score: aiGenScore.likelihood,
          method: aiGenScore.method
        });
      }

      // Check 4: Compression and artifact analysis
      const artifactAnalysis = await this.analyzeArtifacts(fileBuffer);
      if (artifactAnalysis.suspiciousArtifacts.length > 0) {
        results.manipulationDetected = true;
        results.confidence = Math.max(results.confidence, artifactAnalysis.confidence);
        results.details.push({
          type: 'suspicious_artifacts',
          artifacts: artifactAnalysis.suspiciousArtifacts
        });
      }

      // Check 5: Comparison with original
      if (stamp.embedding && stamp.embedding.length > 0) {
        const comparisonResult = await this.compareWithOriginal(fileBuffer, stamp);
        if (comparisonResult.significantChanges) {
          results.manipulationDetected = true;
          results.confidence = Math.max(results.confidence, comparisonResult.confidence);
          results.details.push({
            type: 'significant_changes',
            changes: comparisonResult.changes
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[DeepfakeDetection] Image analysis error:', error);
      return {
        isDeepfake: false,
        manipulationDetected: false,
        aiGenerated: false,
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Analyze video for deepfakes
   */
  static async analyzeVideoDeepfake(fileBuffer, stamp) {
    try {
      const results = {
        isDeepfake: false,
        manipulationDetected: false,
        aiGenerated: false,
        confidence: 0,
        details: [],
        frameAnalysis: [],
        temporalAnomalies: []
      };

      // Extract frames from video and analyze
      const frames = await this.extractVideoFrames(fileBuffer);
      
      let suspiciousFrameCount = 0;
      const frameResults = [];

      for (const frame of frames) {
        const analysis = await this.analyzeImageDeepfake(frame.buffer, stamp);
        frameResults.push({
          frameNumber: frame.number,
          timestamp: frame.timestamp,
          analysis
        });

        if (analysis.isDeepfake || analysis.manipulationDetected) {
          suspiciousFrameCount++;
        }
      }

      const suspiciousRatio = suspiciousFrameCount / frames.length;

      if (suspiciousRatio > 0.3) {
        results.isDeepfake = true;
        results.manipulationDetected = true;
        results.confidence = Math.min(suspiciousRatio, 0.95);
        results.details.push({
          type: 'temporal_deepfake',
          suspiciousFrameRatio: suspiciousRatio,
          totalFrames: frames.length
        });
      }

      // Check temporal consistency
      const temporalAnalysis = await this.analyzeTemporalConsistency(frameResults);
      if (temporalAnalysis.anomalies.length > 0) {
        results.manipulationDetected = true;
        results.confidence = Math.max(results.confidence, temporalAnalysis.confidence);
        results.temporalAnomalies = temporalAnalysis.anomalies;
      }

      results.frameAnalysis = frameResults.slice(0, 5); // Keep first 5 frames

      return results;
    } catch (error) {
      console.error('[DeepfakeDetection] Video analysis error:', error);
      return {
        isDeepfake: false,
        manipulationDetected: false,
        aiGenerated: false,
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Analyze face consistency for deepfakes
   */
  static async analyzeFaceConsistency(imageBuffer, stamp) {
    try {
      // Call Python detection service for face analysis
      const response = await axios.post(
        `${this.DETECTION_SERVICE}/analyze/face-consistency`,
        { image: imageBuffer.toString('base64') },
        { timeout: 30000 }
      ).catch(() => ({ data: { faces: [], anomalies: [], confidence: 0 } }));

      const { faces, anomalies, confidence } = response.data;

      // Check for common deepfake indicators
      const suspiciousPatterns = anomalies.filter(a => 
        ['blinking_rate', 'eye_movement', 'skin_texture', 'lighting_mismatch'].includes(a.type)
      );

      return {
        faces,
        anomalies: suspiciousPatterns,
        confidence: suspiciousPatterns.length > 0 ? confidence : 0
      };
    } catch (error) {
      console.error('[DeepfakeDetection] Face analysis error:', error);
      return { faces: [], anomalies: [], confidence: 0 };
    }
  }

  /**
   * Score deepfake likelihood using ML models
   */
  static async scoreDeepfakeLikelihood(imageBuffer) {
    try {
      // Try to call detection service
      const response = await axios.post(
        `${this.DETECTION_SERVICE}/analyze/deepfake-score`,
        { image: imageBuffer.toString('base64') },
        { timeout: 30000 }
      ).catch(() => ({ data: { likelihood: 0, indicators: [] } }));

      return response.data;
    } catch (error) {
      console.error('[DeepfakeDetection] Deepfake scoring error:', error);
      return { likelihood: 0, indicators: [] };
    }
  }

  /**
   * Score AI-generated content likelihood
   */
  static async scoreAIGeneration(imageBuffer) {
    try {
      // Call detection service for AI-generated detection
      const response = await axios.post(
        `${this.DETECTION_SERVICE}/analyze/ai-generated`,
        { image: imageBuffer.toString('base64') },
        { timeout: 30000 }
      ).catch(() => ({ data: { likelihood: 0, method: null } }));

      return response.data;
    } catch (error) {
      console.error('[DeepfakeDetection] AI generation scoring error:', error);
      return { likelihood: 0, method: null };
    }
  }

  /**
   * Analyze compression and forensic artifacts
   */
  static async analyzeArtifacts(imageBuffer) {
    try {
      const response = await axios.post(
        `${this.DETECTION_SERVICE}/analyze/artifacts`,
        { image: imageBuffer.toString('base64') },
        { timeout: 30000 }
      ).catch(() => ({ data: { suspiciousArtifacts: [], confidence: 0 } }));

      return response.data;
    } catch (error) {
      console.error('[DeepfakeDetection] Artifact analysis error:', error);
      return { suspiciousArtifacts: [], confidence: 0 };
    }
  }

  /**
   * Compare with original stamp
   */
  static async compareWithOriginal(fileBuffer, stamp) {
    try {
      const response = await axios.post(
        `${this.DETECTION_SERVICE}/analyze/compare`,
        {
          currentImage: fileBuffer.toString('base64'),
          originalHash: stamp.originalHash,
          pHash: stamp.pHash,
          embedding: stamp.embedding
        },
        { timeout: 30000 }
      ).catch(() => ({ data: { significantChanges: false, confidence: 0, changes: [] } }));

      return response.data;
    } catch (error) {
      console.error('[DeepfakeDetection] Comparison error:', error);
      return { significantChanges: false, confidence: 0, changes: [] };
    }
  }

  /**
   * Extract frames from video
   */
  static async extractVideoFrames(videoBuffer) {
    try {
      const response = await axios.post(
        `${this.DETECTION_SERVICE}/video/extract-frames`,
        { video: videoBuffer.toString('base64') },
        { timeout: 60000 }
      ).catch(() => ({ data: { frames: [] } }));

      return response.data.frames || [];
    } catch (error) {
      console.error('[DeepfakeDetection] Frame extraction error:', error);
      return [];
    }
  }

  /**
   * Analyze temporal consistency in video frames
   */
  static async analyzeTemporalConsistency(frameResults) {
    try {
      const anomalies = [];
      let totalConfidence = 0;

      for (let i = 1; i < frameResults.length; i++) {
        const prev = frameResults[i - 1];
        const curr = frameResults[i];

        // Check for sudden changes
        if (curr.analysis.confidence > 0.6 && prev.analysis.confidence < 0.3) {
          anomalies.push({
            type: 'sudden_change',
            frames: `${i - 1}-${i}`,
            severity: 'high'
          });
          totalConfidence += 0.5;
        }

        // Check for lighting inconsistencies
        if (curr.analysis.details.some(d => d.type === 'lighting_mismatch')) {
          anomalies.push({
            type: 'lighting_inconsistency',
            frame: i,
            severity: 'medium'
          });
          totalConfidence += 0.3;
        }
      }

      return {
        anomalies,
        confidence: Math.min(totalConfidence / frameResults.length, 0.95)
      };
    } catch (error) {
      console.error('[DeepfakeDetection] Temporal analysis error:', error);
      return { anomalies: [], confidence: 0 };
    }
  }

  /**
   * Create alert for manipulation detection
   */
  static async createManipulationAlert(stampId, analysisResults) {
    try {
      const { prisma } = require('../config/prisma');

      const alert = await prisma.userNotification.create({
        data: {
          userId: (await prisma.stamp.findUnique({
            where: { id: stampId },
            select: { passport: { select: { userId: true } } }
          })).passport.userId,
          type: 'manipulation_detected',
          title: 'Deepfake/Manipulation Detected',
          body: analysisResults.isDeepfake 
            ? `Deepfake detected: ${(analysisResults.confidence * 100).toFixed(0)}% confidence`
            : `Manipulation detected: ${(analysisResults.confidence * 100).toFixed(0)}% confidence`,
          link: `/stamp/${stampId}#forensics`
        }
      });

      return alert;
    } catch (error) {
      console.error('[DeepfakeDetection] Alert creation error:', error);
    }
  }

  /**
   * Get deepfake detection history for a stamp
   */
  static async getAnalysisHistory(stampId, passportId) {
    try {
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { passportId: true }
      });

      if (!stamp || stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      // Would query stored analysis results
      // For now, return structure
      return {
        stampId,
        analyses: [],
        latestAnalysis: null,
        riskLevel: 'low'
      };
    } catch (error) {
      console.error('[DeepfakeDetection] History error:', error);
      throw error;
    }
  }
}

module.exports = DeepfakeDetection;
