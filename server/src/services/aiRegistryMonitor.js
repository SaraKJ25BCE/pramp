/**
 * AI Registry Monitor Service
 * 
 * Monitors AI training platforms (Hugging Face, Replicate, Stability AI, etc.)
 * to detect if stamped works are being used in datasets or model training.
 * 
 * Integrates with:
 * - Hugging Face API (dataset/model search)
 * - Replicate API (model search)
 * - Stability AI (proprietary models check)
 * - CivitAI (community models)
 * - Model Forge and others
 */

const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../config/prisma');
const { auditLog } = require('./auditLog');

class AIRegistryMonitor {
  // Platform configurations
  static PLATFORMS = {
    hugging_face: {
      name: 'Hugging Face',
      baseUrl: 'https://huggingface.co/api',
      requiresAuth: true,
      endpoints: {
        models: '/models',
        datasets: '/datasets',
        search: '/v1/search'
      }
    },
    replicate: {
      name: 'Replicate',
      baseUrl: 'https://api.replicate.com/v1',
      requiresAuth: true,
      endpoints: {
        models: '/models',
        search: '/models/search'
      }
    },
    stability_ai: {
      name: 'Stability AI',
      baseUrl: 'https://api.stability.ai',
      requiresAuth: true,
      private: true // Proprietary models, harder to check
    },
    civitai: {
      name: 'CivitAI',
      baseUrl: 'https://civitai.com/api',
      requiresAuth: false,
      endpoints: {
        models: '/v1/models'
      }
    },
    modelforge: {
      name: 'Model Forge',
      baseUrl: 'https://modelforge.ai/api',
      requiresAuth: true,
      endpoints: {
        search: '/search'
      }
    },
    kaggle: {
      name: 'Kaggle',
      baseUrl: 'https://www.kaggle.com/api/v1',
      requiresAuth: true,
      endpoints: {
        datasets: '/datasets/list'
      }
    }
  };

  /**
   * Enable AI Registry monitoring for a stamp
   */
  static async enableMonitoring(
    stampId,
    passportId,
    platforms = ['hugging_face', 'replicate', 'civitai'],
    scanFrequency = 'weekly'
  ) {
    try {
      // Verify ownership
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { passportId: true }
      });

      if (!stamp || stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      // Calculate next scan time based on frequency
      const nextScanAt = this.calculateNextScanTime(scanFrequency);

      const monitoring = await prisma.aIRegistryMonitor.create({
        data: {
          stampId,
          monitoringPlatforms: JSON.stringify(
            Object.fromEntries(
              platforms.map(p => [p, { enabled: true, lastScanAt: null, detectionCount: 0 }])
            )
          ),
          isActive: true,
          scanFrequency,
          nextScanAt,
          lastScanAt: null
        },
        include: { stamp: true }
      });

      await auditLog({
        action: 'ai_registry_monitoring_enabled',
        stampId,
        passportId,
        metadata: {
          platforms,
          scanFrequency,
          nextScanAt
        }
      });

      return {
        id: monitoring.id,
        stampId: monitoring.stampId,
        platforms: platforms,
        scanFrequency: monitoring.scanFrequency,
        nextScanAt: monitoring.nextScanAt,
        status: 'monitoring_active'
      };
    } catch (error) {
      console.error('[AIRegistryMonitor] Error enabling monitoring:', error);
      throw error;
    }
  }

  /**
   * Scan AI registries for unauthorized usage
   */
  static async scanRegistries(stampId, passportId) {
    try {
      const monitor = await prisma.aIRegistryMonitor.findFirst({
        where: {
          stampId,
          isActive: true
        },
        include: { stamp: true }
      });

      if (!monitor) {
        throw new Error('Monitoring not enabled for this stamp');
      }

      const platforms = JSON.parse(monitor.monitoringPlatforms);
      const detections = [];

      // Scan each platform
      for (const [platform, config] of Object.entries(platforms)) {
        if (!config.enabled) continue;

        try {
          const platformDetections = await this.scanPlatform(
            platform,
            monitor.stamp,
            stampId
          );
          detections.push(...platformDetections);
        } catch (error) {
          console.error(`[AIRegistryMonitor] Error scanning ${platform}:`, error);
          // Continue with other platforms
        }
      }

      // Update monitor
      const updatedMonitor = await prisma.aIRegistryMonitor.update({
        where: { id: monitor.id },
        data: {
          lastScanAt: new Date(),
          nextScanAt: this.calculateNextScanTime(monitor.scanFrequency),
          detectionCount: monitor.detectionCount + detections.length
        }
      });

      if (detections.length > 0) {
        await auditLog({
          action: 'ai_training_detections_found',
          stampId,
          passportId,
          metadata: {
            detectionCount: detections.length,
            platforms: detections.map(d => d.platform),
            models: detections.map(d => d.modelId)
          }
        });
      }

      return {
        scanedAt: new Date(),
        detections: detections,
        nextScanAt: updatedMonitor.nextScanAt,
        totalDetections: updatedMonitor.detectionCount
      };
    } catch (error) {
      console.error('[AIRegistryMonitor] Error scanning registries:', error);
      throw error;
    }
  }

  /**
   * Scan individual platform
   */
  static async scanPlatform(platform, stamp, stampId) {
    const detections = [];

    switch (platform) {
      case 'hugging_face':
        detections.push(...await this.scanHuggingFace(stamp, stampId));
        break;
      case 'replicate':
        detections.push(...await this.scanReplicate(stamp, stampId));
        break;
      case 'civitai':
        detections.push(...await this.scanCivitAI(stamp, stampId));
        break;
      case 'stability_ai':
        // Private platform - limited scanning
        detections.push(...await this.scanStabilityAI(stamp, stampId));
        break;
      case 'kaggle':
        detections.push(...await this.scanKaggle(stamp, stampId));
        break;
    }

    return detections;
  }

  /**
   * Scan Hugging Face datasets and models
   */
  static async scanHuggingFace(stamp, stampId) {
    const detections = [];

    try {
      // Search for models that mention the creator or work title
      const searchTerms = [
        stamp.title,
        stamp.originalHash.substring(0, 16), // First 16 chars of hash
        stamp.pHash // Perceptual hash
      ];

      for (const term of searchTerms) {
        try {
          const response = await axios.get(
            `${this.PLATFORMS.hugging_face.baseUrl}/models`,
            {
              params: {
                search: term,
                limit: 10
              },
              timeout: 5000
            }
          );

          if (response.data && response.data.length > 0) {
            for (const model of response.data) {
              // Check if model description mentions the original work
              if (this.checkForPlagiarism(model, stamp)) {
                const detection = await this.createDetection(
                  stampId,
                  'hugging_face',
                  model.id || model.modelId,
                  model.modelId || model.id,
                  model.url || `https://huggingface.co/${model.id}`,
                  'metadata_analysis',
                  0.65
                );
                detections.push(detection);
              }
            }
          }
        } catch (error) {
          // Continue with next search term
        }
      }

      // Check datasets
      try {
        const datasetResponse = await axios.get(
          `${this.PLATFORMS.hugging_face.baseUrl}/datasets`,
          {
            params: {
              search: stamp.title,
              limit: 5
            },
            timeout: 5000
          }
        );

        if (datasetResponse.data && datasetResponse.data.length > 0) {
          for (const dataset of datasetResponse.data) {
            if (this.checkForPlagiarism(dataset, stamp)) {
              const detection = await this.createDetection(
                stampId,
                'hugging_face',
                dataset.id,
                dataset.id,
                `https://huggingface.co/datasets/${dataset.id}`,
                'metadata_analysis',
                0.60
              );
              detections.push(detection);
            }
          }
        }
      } catch (error) {
        // Continue
      }
    } catch (error) {
      console.error('[AIRegistryMonitor] Hugging Face scan error:', error.message);
    }

    return detections;
  }

  /**
   * Scan Replicate models
   */
  static async scanReplicate(stamp, stampId) {
    const detections = [];

    try {
      const response = await axios.get(
        `${this.PLATFORMS.replicate.baseUrl}/models`,
        {
          timeout: 5000
        }
      );

      if (response.data && Array.isArray(response.data)) {
        for (const model of response.data) {
          // Check model description and metadata
          if (this.checkForPlagiarism(model, stamp)) {
            const detection = await this.createDetection(
              stampId,
              'replicate',
              model.url || model.id,
              model.name,
              model.url,
              'metadata_analysis',
              0.60
            );
            detections.push(detection);
          }
        }
      }
    } catch (error) {
      console.error('[AIRegistryMonitor] Replicate scan error:', error.message);
    }

    return detections;
  }

  /**
   * Scan CivitAI community models
   */
  static async scanCivitAI(stamp, stampId) {
    const detections = [];

    try {
      const response = await axios.get(
        `${this.PLATFORMS.civitai.baseUrl}/v1/models`,
        {
          params: {
            search: stamp.title,
            limit: 10
          },
          timeout: 5000
        }
      );

      if (response.data && response.data.items) {
        for (const model of response.data.items) {
          if (this.checkForPlagiarism(model, stamp)) {
            const detection = await this.createDetection(
              stampId,
              'civitai',
              model.id,
              model.name,
              model.url || `https://civitai.com/models/${model.id}`,
              'metadata_analysis',
              0.55
            );
            detections.push(detection);
          }
        }
      }
    } catch (error) {
      console.error('[AIRegistryMonitor] CivitAI scan error:', error.message);
    }

    return detections;
  }

  /**
   * Scan Kaggle datasets
   */
  static async scanKaggle(stamp, stampId) {
    const detections = [];

    try {
      const response = await axios.get(
        `${this.PLATFORMS.kaggle.baseUrl}/datasets/list`,
        {
          params: {
            search: stamp.title,
            limit: 5
          },
          timeout: 5000
        }
      );

      if (response.data && response.data.datasets) {
        for (const dataset of response.data.datasets) {
          if (this.checkForPlagiarism(dataset, stamp)) {
            const detection = await this.createDetection(
              stampId,
              'kaggle',
              dataset.ref,
              dataset.title,
              dataset.url,
              'metadata_analysis',
              0.60
            );
            detections.push(detection);
          }
        }
      }
    } catch (error) {
      console.error('[AIRegistryMonitor] Kaggle scan error:', error.message);
    }

    return detections;
  }

  /**
   * Scan Stability AI (limited - proprietary)
   */
  static async scanStabilityAI(stamp, stampId) {
    // Stability AI doesn't expose public model lists
    // This would require specialized access or monitoring of generated images
    // For now, return empty - can be enhanced with official partnership
    return [];
  }

  /**
   * Check if AI platform model/dataset plagiarizes the stamp
   */
  static checkForPlagiarism(platformItem, stamp) {
    const itemText = JSON.stringify(platformItem).toLowerCase();
    const stampText = `${stamp.title} ${stamp.description || ''}`.toLowerCase();
    
    // Check for exact matches or high similarity
    const patterns = [
      stamp.title.toLowerCase(),
      stamp.originalHash.substring(0, 16),
      stamp.pHash?.substring(0, 12)
    ];

    for (const pattern of patterns) {
      if (pattern && itemText.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a training detection record
   */
  static async createDetection(
    stampId,
    platform,
    modelId,
    modelName,
    modelUrl,
    detectionMethod,
    confidence
  ) {
    try {
      const monitor = await prisma.aIRegistryMonitor.findFirst({
        where: { stampId, isActive: true }
      });

      if (!monitor) {
        throw new Error('Monitor not found');
      }

      const detection = await prisma.aITrainingDetection.create({
        data: {
          registryMonitorId: monitor.id,
          stampId,
          platform,
          modelId,
          modelName,
          modelUrl,
          detectionMethod,
          confidence,
          responseStatus: 'new'
        }
      });

      return {
        id: detection.id,
        platform: detection.platform,
        modelId: detection.modelId,
        modelName: detection.modelName,
        modelUrl: detection.modelUrl,
        confidence: detection.confidence,
        detectedAt: detection.detectedAt
      };
    } catch (error) {
      console.error('[AIRegistryMonitor] Error creating detection:', error);
      throw error;
    }
  }

  /**
   * Calculate next scan time based on frequency
   */
  static calculateNextScanTime(frequency = 'weekly') {
    const now = new Date();
    const intervals = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000
    };

    const interval = intervals[frequency] || intervals.weekly;
    return new Date(now.getTime() + interval);
  }

  /**
   * Disable monitoring for a stamp
   */
  static async disableMonitoring(stampId, passportId) {
    try {
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { passportId: true }
      });

      if (!stamp || stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      const monitor = await prisma.aIRegistryMonitor.update({
        where: {
          id: (await prisma.aIRegistryMonitor.findFirst({
            where: { stampId },
            select: { id: true }
          })).id
        },
        data: { isActive: false }
      });

      await auditLog({
        action: 'ai_registry_monitoring_disabled',
        stampId,
        passportId
      });

      return { success: true, disabled: true };
    } catch (error) {
      console.error('[AIRegistryMonitor] Error disabling monitoring:', error);
      throw error;
    }
  }
}

module.exports = AIRegistryMonitor;
