/**
 * AI Access Control Service
 * 
 * Manages AI model access tokens and license verification for stamped works.
 * Prevents unauthorized AI training on protected content.
 * 
 * Features:
 * - Generate unique access control tokens per stamp
 * - Define license restrictions (commercial, modification, attribution)
 * - Verify token authenticity against platform API attempts
 * - Track AI model usage and generate audit trails
 */

const crypto = require('crypto');
const prisma = require('../config/prisma');
const { auditLog } = require('./auditLog');

class AIAccessControl {
  /**
   * Generate AI Access Token for a stamp
   * Token is used by AI platforms to verify licensing before training
   */
  static async generateAccessToken(
    stampId,
    purpose = 'license_verification',
    licenseType = 'all-rights-reserved',
    restrictions = {},
    passportId
  ) {
    try {
      // Generate cryptographically secure token
      const tokenBuffer = crypto.randomBytes(32);
      const tokenHex = tokenBuffer.toString('hex');
      const tokenPrefix = 'aitoken_' + crypto.randomBytes(4).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenHex).digest('hex');

      // Parse restrictions
      const restrictionsJson = JSON.stringify({
        allowAI: restrictions.allowAI ?? false,
        allowCommercial: restrictions.allowCommercial ?? false,
        allowModification: restrictions.allowModification ?? false,
        attributionRequired: restrictions.attributionRequired ?? true,
        ...restrictions
      });

      // Create token in database
      const token = await prisma.aIAccessToken.create({
        data: {
          stampId,
          tokenHash,
          tokenPrefix,
          purpose,
          licenseType,
          restrictions: restrictionsJson,
          expiresAt: restrictions.expiresAt || null
        },
        include: { stamp: true }
      });

      // Audit log
      await auditLog({
        action: 'ai_access_token_generated',
        stampId,
        passportId,
        metadata: {
          tokenPrefix,
          purpose,
          licenseType,
          expiresAt: restrictions.expiresAt
        }
      });

      // Return full token (only shown once at creation)
      return {
        id: token.id,
        token: `${tokenPrefix}.${tokenHex}`,
        prefix: tokenPrefix,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        licenseType: token.licenseType,
        restrictions: JSON.parse(token.restrictions)
      };
    } catch (error) {
      console.error('[AIAccessControl] Error generating token:', error);
      throw error;
    }
  }

  /**
   * Verify AI Access Token
   * Called by AI platforms to check if they can use content for training
   */
  static async verifyAccessToken(tokenString) {
    try {
      if (!tokenString || !tokenString.includes('.')) {
        return {
          valid: false,
          reason: 'Invalid token format'
        };
      }

      const [prefix, hex] = tokenString.split('.');
      const tokenHash = crypto.createHash('sha256').update(hex).digest('hex');

      // Look up token
      const token = await prisma.aIAccessToken.findUnique({
        where: { tokenHash },
        include: {
          stamp: {
            select: {
              id: true,
              title: true,
              originalHash: true,
              aiOptOut: true,
              passportId: true
            }
          }
        }
      });

      if (!token) {
        return {
          valid: false,
          reason: 'Token not found'
        };
      }

      // Check if revoked
      if (token.revokedAt) {
        return {
          valid: false,
          reason: 'Token has been revoked'
        };
      }

      // Check if expired
      if (token.expiresAt && token.expiresAt < new Date()) {
        return {
          valid: false,
          reason: 'Token has expired'
        };
      }

      // Parse restrictions
      const restrictions = JSON.parse(token.restrictions);

      // Update verification count and timestamp
      await prisma.aIAccessToken.update({
        where: { id: token.id },
        data: {
          verificationCount: token.verificationCount + 1,
          lastVerifiedAt: new Date()
        }
      });

      // Log verification attempt
      await auditLog({
        action: 'ai_token_verified',
        stampId: token.stampId,
        passportId: token.stamp.passportId,
        metadata: {
          tokenPrefix: token.tokenPrefix,
          licenseType: token.licenseType
        }
      });

      return {
        valid: true,
        stamp: {
          id: token.stampId,
          title: token.stamp.title,
          fileHash: token.stamp.originalHash
        },
        license: {
          type: token.licenseType,
          restrictions: restrictions,
          issuedAt: token.issuedAt,
          expiresAt: token.expiresAt
        },
        allowTraining: restrictions.allowAI === true,
        allowCommercial: restrictions.allowCommercial === true,
        message: restrictions.allowAI 
          ? `Licensed for AI training under ${token.licenseType} terms`
          : 'This work is protected from AI training'
      };
    } catch (error) {
      console.error('[AIAccessControl] Error verifying token:', error);
      return {
        valid: false,
        reason: 'Verification failed'
      };
    }
  }

  /**
   * Revoke AI Access Token
   */
  static async revokeAccessToken(tokenId, passportId, reason = '') {
    try {
      const token = await prisma.aIAccessToken.update({
        where: { id: tokenId },
        data: {
          revokedAt: new Date()
        },
        include: { stamp: true }
      });

      await auditLog({
        action: 'ai_access_token_revoked',
        stampId: token.stampId,
        passportId,
        metadata: {
          tokenPrefix: token.tokenPrefix,
          reason
        }
      });

      return { success: true, revokedAt: token.revokedAt };
    } catch (error) {
      console.error('[AIAccessControl] Error revoking token:', error);
      throw error;
    }
  }

  /**
   * Get all access tokens for a stamp
   */
  static async getStampTokens(stampId, passportId) {
    try {
      // Verify ownership
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { passportId: true }
      });

      if (!stamp || stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      const tokens = await prisma.aIAccessToken.findMany({
        where: { stampId },
        select: {
          id: true,
          tokenPrefix: true,
          purpose: true,
          licenseType: true,
          restrictions: true,
          issuedAt: true,
          expiresAt: true,
          revokedAt: true,
          verificationCount: true,
          lastVerifiedAt: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return tokens.map(t => ({
        ...t,
        restrictions: JSON.parse(t.restrictions)
      }));
    } catch (error) {
      console.error('[AIAccessControl] Error getting tokens:', error);
      throw error;
    }
  }

  /**
   * Update license type for a stamp
   */
  static async updateLicenseType(stampId, passportId, newLicenseType) {
    try {
      // Verify ownership
      const stamp = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { passportId: true }
      });

      if (!stamp || stamp.passportId !== passportId) {
        throw new Error('Unauthorized');
      }

      // Revoke all existing tokens for this stamp
      await prisma.aIAccessToken.updateMany({
        where: {
          stampId,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });

      // Create new token with updated license
      const newToken = await this.generateAccessToken(
        stampId,
        'license_verification',
        newLicenseType,
        {},
        passportId
      );

      await auditLog({
        action: 'stamp_license_updated',
        stampId,
        passportId,
        metadata: {
          newLicenseType
        }
      });

      return newToken;
    } catch (error) {
      console.error('[AIAccessControl] Error updating license:', error);
      throw error;
    }
  }
}

module.exports = AIAccessControl;
