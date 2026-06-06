/**
 * Fair Use Detection Service
 * 
 * Analyzes detected content usage to determine if it qualifies as fair use
 * under Indian Copyright Law, preventing wrongful takedown notices.
 * 
 * Fair use factors under Copyright Act, 1957:
 * 1. Purpose and character of use (criticism, commentary, news, education)
 * 2. Nature of the copyrighted work
 * 3. Amount and substantiality of work used
 * 4. Effect on market value of original work
 * 
 * Additional considerations:
 * - Attribution presence
 * - Transformative nature of derivative work
 * - Commercial vs non-commercial use
 */

const { prisma } = require('../config/prisma');
const { auditLog } = require('./auditLog');

class FairUseDetection {
  /**
   * Analyze if detected usage qualifies as fair use
   */
  static async analyzeFairUse(detectionId, passportId) {
    try {
      const detection = await prisma.aITrainingDetection.findUnique({
        where: { id: detectionId },
        include: {
          registryMonitor: {
            include: { stamp: true }
          }
        }
      });

      if (!detection) {
        throw new Error('Detection not found');
      }

      // Verify ownership
      if (detection.registryMonitor.stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      const fairUseAssessment = {
        detectionId,
        stampId: detection.stampId,
        platform: detection.platform,
        modelName: detection.modelName,
        assessmentDate: new Date(),
        
        // Four factor analysis
        factors: {
          purpose: this.assessPurpose(detection),
          nature: this.assessNature(detection),
          amount: this.assessAmount(detection),
          marketEffect: this.assessMarketEffect(detection)
        },
        
        // Overall assessment
        likelyFairUse: false,
        fairUseScore: 0, // 0-100, >60 = likely fair use
        recommendation: 'monitor', // monitor | likely_fair_use | likely_infringement
        explanation: ''
      };

      // Calculate fair use score
      const scores = Object.values(fairUseAssessment.factors).map(f => f.score);
      fairUseAssessment.fairUseScore = Math.round(
        (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
      );

      // Determine if fair use
      if (fairUseAssessment.fairUseScore >= 60) {
        fairUseAssessment.likelyFairUse = true;
        fairUseAssessment.recommendation = 'likely_fair_use';
        fairUseAssessment.explanation = this.generateExplanation(fairUseAssessment.factors);
      } else if (fairUseAssessment.fairUseScore < 40) {
        fairUseAssessment.recommendation = 'likely_infringement';
        fairUseAssessment.explanation = this.generateExplanation(fairUseAssessment.factors);
      }

      // Log assessment
      await auditLog({
        action: 'fair_use_assessment',
        stampId: detection.stampId,
        passportId,
        metadata: {
          detectionId,
          recommendation: fairUseAssessment.recommendation,
          fairUseScore: fairUseAssessment.fairUseScore
        }
      });

      return fairUseAssessment;
    } catch (error) {
      console.error('[FairUseDetection] Analysis error:', error);
      throw error;
    }
  }

  /**
   * Factor 1: Purpose and Character of Use
   */
  static assessPurpose(detection) {
    let score = 0.5; // Default neutral

    const purposeIndicators = {
      // Fair use purposes
      'education': 0.9,
      'commentary': 0.85,
      'criticism': 0.85,
      'news': 0.8,
      'research': 0.8,
      'parody': 0.85,
      'archival': 0.75,
      
      // Unfair use purposes
      'commercial': 0.2,
      'profit': 0.1,
      'resale': 0.05,
      'distribution': 0.15,
      'replacement': 0.1
    };

    // Analyze model metadata and usage context
    const metadata = detection.modelUrl.toLowerCase() + 
                   (detection.modelName || '').toLowerCase() +
                   (detection.datasetName || '').toLowerCase();

    for (const [purpose, indicator] of Object.entries(purposeIndicators)) {
      if (metadata.includes(purpose)) {
        score = indicator;
        break;
      }
    }

    // Transformative use (modified content scores higher)
    if (metadata.includes('transform') || metadata.includes('style') || 
        metadata.includes('derivative')) {
      score = Math.min(score + 0.2, 1.0);
    }

    // Attribution presence
    if (detection.modelName && detection.modelName.includes(detection.registryMonitor?.stamp?.title)) {
      score = Math.max(score - 0.1, 0); // Exact copy is less fair
    }

    return {
      name: 'Purpose and Character of Use',
      score,
      reasoning: this.getPurposeReasoning(score)
    };
  }

  /**
   * Factor 2: Nature of the Copyrighted Work
   */
  static assessNature(detection) {
    let score = 0.5;

    const stamp = detection.registryMonitor?.stamp;

    if (!stamp) {
      return {
        name: 'Nature of Work',
        score,
        reasoning: 'Unable to determine'
      };
    }

    // Factual works (news, documentation) score higher for fair use
    const factualCategories = ['document', 'design', 'code', 'research'];
    const creativeCategories = ['music', 'video', 'image', 'photograph', 'art'];

    for (const category of factualCategories) {
      if (stamp.category?.includes(category)) {
        score = 0.6; // More lenient
        break;
      }
    }

    for (const category of creativeCategories) {
      if (stamp.category?.includes(category)) {
        score = 0.4; // More strict
        break;
      }
    }

    return {
      name: 'Nature of Work',
      score,
      reasoning: `${stamp.category || 'unknown'} category works favor fair use ${score > 0.5 ? 'more' : 'less'}`
    };
  }

  /**
   * Factor 3: Amount and Substantiality of Work Used
   */
  static assessAmount(detection) {
    let score = 0.5;

    // If work is used in its entirety, scores lower
    // If small portion is used, scores higher
    
    if (detection.confidence < 0.3) {
      // Low confidence = small portion used
      score = 0.8;
    } else if (detection.confidence < 0.6) {
      // Medium confidence = moderate portion
      score = 0.5;
    } else {
      // High confidence = substantial/entire work
      score = 0.2;
    }

    return {
      name: 'Amount and Substantiality',
      score,
      reasoning: `${(detection.confidence * 100).toFixed(0)}% match - ${
        score > 0.6 ? 'small portion' :
        score > 0.3 ? 'moderate portion' :
        'substantial portion'
      }`
    };
  }

  /**
   * Factor 4: Effect on Market Value of Original
   */
  static assessMarketEffect(detection) {
    let score = 0.5;

    const stamp = detection.registryMonitor?.stamp;

    if (!stamp) {
      return {
        name: 'Effect on Market Value',
        score,
        reasoning: 'Unable to determine market impact'
      };
    }

    // AI training dataset usage typically harms market value
    // But educational/commentary use may not

    // Check if platform is commercial
    const commercialPlatforms = ['replicate', 'stability_ai', 'modelforge'];
    const academicPlatforms = ['hugging_face', 'civitai', 'github'];

    for (const platform of commercialPlatforms) {
      if (detection.platform?.includes(platform)) {
        score = 0.2; // Harms market value
        break;
      }
    }

    for (const platform of academicPlatforms) {
      if (detection.platform?.includes(platform)) {
        score = 0.6; // Less market harm
        break;
      }
    }

    // AI training always creates substitute goods
    // Creator's ability to monetize is harmed
    score = Math.max(score * 0.6, 0.1); // Heavy penalty for market harm

    return {
      name: 'Effect on Market Value',
      score,
      reasoning: `${detection.platform} use ${score > 0.5 ? 'minimally' : 'significantly'} harms market value`
    };
  }

  /**
   * Generate human-readable explanation
   */
  static generateExplanation(factors) {
    const explanations = [];

    if (factors.purpose.score > 0.7) {
      explanations.push('Use appears to be for fair use purpose (education, criticism, etc.)');
    } else if (factors.purpose.score < 0.3) {
      explanations.push('Use appears commercial/profit-motivated');
    }

    if (factors.amount.score > 0.7) {
      explanations.push('Only a small portion of your work was used');
    } else if (factors.amount.score < 0.3) {
      explanations.push('The entirety or substantial portion of your work was used');
    }

    if (factors.nature.score > 0.6) {
      explanations.push('The nature of your work (factual) is conducive to fair use');
    } else if (factors.nature.score < 0.4) {
      explanations.push('Your creative work receives stronger copyright protection');
    }

    if (factors.marketEffect.score < 0.3) {
      explanations.push('The use significantly harms your market opportunity');
    } else if (factors.marketEffect.score > 0.6) {
      explanations.push('The use has minimal market impact');
    }

    return explanations.join('. ') || 'Unable to determine fair use status.';
  }

  /**
   * Get purpose factor reasoning
   */
  static getPurposeReasoning(score) {
    if (score > 0.8) {
      return 'Highly transformative fair use purpose (education, criticism, commentary)';
    } else if (score > 0.6) {
      return 'Likely transformative or educational use';
    } else if (score > 0.4) {
      return 'Mixed purpose, unclear whether transformative';
    } else if (score > 0.2) {
      return 'Likely commercial or profit-motivated use';
    } else {
      return 'Clear commercial/substitution purpose - unfair use';
    }
  }

  /**
   * Filter detections by fair use assessment
   */
  static async filterFairUseDetections(stampId, passportId) {
    try {
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { passportId: true }
      });

      if (!stamp || stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      const detections = await prisma.aITrainingDetection.findMany({
        where: { stampId },
        include: {
          registryMonitor: { include: { stamp: true } }
        }
      });

      const assessments = {};
      const probableInfringements = [];

      for (const detection of detections) {
        const assessment = await this.analyzeFairUse(detection.id, passportId);
        assessments[detection.id] = assessment;

        // Only recommend takedown if NOT likely fair use
        if (!assessment.likelyFairUse && assessment.recommendation === 'likely_infringement') {
          probableInfringements.push({
            detection,
            assessment
          });
        }
      }

      return {
        stampId,
        totalDetections: detections.length,
        probableInfringements: probableInfringements.length,
        assessments,
        recommendations: probableInfringements.map(item => ({
          detectionId: item.detection.id,
          platform: item.detection.platform,
          recommendation: 'send_takedown',
          reasoning: item.assessment.explanation
        }))
      };
    } catch (error) {
      console.error('[FairUseDetection] Filter error:', error);
      throw error;
    }
  }

  /**
   * Get configuration for fair use thresholds
   */
  static getConfig() {
    return {
      fairUseThreshold: 60, // 0-100 score where >60 = fair use
      strictMode: process.env.FAIR_USE_STRICT_MODE === 'true',
      
      // Configurable thresholds per factor
      purposeThreshold: 0.6,
      amountThreshold: 0.5,
      natureThreshold: 0.5,
      marketEffectThreshold: 0.4,
      
      // Indian law specific settings
      jurisdiction: 'India',
      applicableLaw: 'Copyright Act, 1957',
      
      // Exclude categories from fair use consideration
      excludeCategories: ['music', 'film', 'audiovisual'],
      
      // Platforms to treat more strictly
      strictPlatforms: ['replicate', 'stability_ai', 'modelforge']
    };
  }
}

module.exports = FairUseDetection;
