# AI Training Protection & Plagiarism Detection System

**ProofStamp Enterprise v2.1** - PhD-Level IP Protection for Digital Creators in India

## Overview

ProofStamp now includes comprehensive AI training protection and advanced plagiarism detection, making it the most sophisticated copyright protection platform in India.

### Core Features

#### 1. **AI Access Control Token System**
- Generate unique access tokens for each stamped work
- Define granular licensing restrictions
- Prevent unauthorized AI training
- Track all AI platform access attempts
- Revoke access at any time

```bash
POST /api/ai-protection/access-token
{
  "stampId": "PS-2026-XXXXX",
  "licenseType": "all-rights-reserved",
  "restrictions": {
    "allowAI": false,
    "allowCommercial": false,
    "allowModification": false,
    "attributionRequired": true
  }
}
```

#### 2. **AI Registry Monitoring**
- Monitor Hugging Face datasets and models
- Track Replicate model registry
- Monitor CivitAI community models
- Scan Stability AI integrations
- Track Kaggle datasets
- Search GitHub repositories

Automatically scan every 6 hours for your protected works appearing in AI training.

```bash
POST /api/ai-protection/registry-monitor
{
  "stampId": "PS-2026-XXXXX",
  "platforms": ["hugging_face", "replicate", "civitai", "kaggle"],
  "scanFrequency": "weekly"
}
```

#### 3. **AI Training Detection**
- Detect if your work is in LAION-5B, OpenImages, COCO, ImageNet
- Embedding similarity analysis against published models
- Metadata analysis of model cards
- Legal action support with evidence

```bash
GET /api/ai-protection/analysis/:stampId
```

#### 4. **Deepfake & Manipulation Detection**
- Face consistency analysis
- Deepfake likelihood scoring
- AI-generated image detection
- Compression artifact analysis
- Comparison with original
- Temporal video analysis

```bash
POST /api/ai-protection/deepfake-analysis
{
  "stampId": "PS-2026-XXXXX",
  "file": <binary>,
  "fileType": "image|video"
}
```

#### 5. **Plagiarism Tracking Across Web**
- Deep web scanning
- Blockchain explorer monitoring (NFT theft)
- Cross-platform similarity matching
- AI-generated image detection
- Manipulation detection

## API Endpoints

### Access Control Tokens

```bash
# Generate new access token
POST /api/ai-protection/access-token

# List all tokens for a stamp
GET /api/ai-protection/access-tokens/:stampId

# Verify token (PUBLIC - no auth)
POST /api/ai-protection/verify-token

# Revoke token
DELETE /api/ai-protection/access-token/:tokenId
```

### Registry Monitoring

```bash
# Enable monitoring for a stamp
POST /api/ai-protection/registry-monitor

# Scan AI registries now
POST /api/ai-protection/scan/:stampId

# Get detected instances
GET /api/ai-protection/detections/:stampId

# Report unauthorized use to platform
POST /api/ai-protection/report-detection/:detectionId

# Disable monitoring
DELETE /api/ai-protection/registry-monitor/:stampId
```

### Analysis & History

```bash
# Analyze dataset usage
GET /api/ai-protection/analysis/:stampId

# Get complete detection history
GET /api/ai-protection/history/:stampId
```

## Authentication

All endpoints except `/verify-token` require authentication:
- JWT Bearer token: `Authorization: Bearer <token>`
- API Key: `X-ProofStamp-Api-Key: <key>` or `X-Api-Key: <key>`

## Legal Compliance (India)

### Basis in Indian Law

1. **Information Technology Act, 2000**
   - Section 65: Tampering with computer source documents
   - Section 67: Punishment for publishing obscene material in electronic form
   - Section 72: Reasonable security practices and procedures

2. **Bharatiya Nyaya Sanhita (BNS) 2023**
   - Section 63: Electronic Records in evidence
   - Our AI protection acts as a tamper-proof evidence system

3. **Copyright Act, 1957**
   - Section 13: Infringement of copyright
   - Our platform documents original authorship and ownership

4. **Information Technology Rules, 2021**
   - Rule 3(1)(b): Intermediary due diligence
   - Our takedown automation complies with Rule 3(1)(b)(iv) notice format

### Evidence for Court

Our AI protection system provides:
- **Timestamp Authority Proof** (RFC 3161): Court-admissible proof of creation
- **Blockchain Anchor**: Immutable ledger entry
- **AI Access Token**: Licensing proof
- **Detection Records**: Detailed evidence of unauthorized training
- **Audit Trail**: Complete chain of custody
- **Creator Attestation**: Sworn statement of originality

## Database Schema

### New Tables

**AIAccessToken**: Licensing control tokens
```sql
- id: String (PK)
- stampId: String (FK to Stamp)
- tokenHash: String (unique)
- tokenPrefix: String (unique, shown to user)
- licenseType: String (all-rights-reserved | cc-by | cc-by-sa | ...)
- restrictions: JSON (allowAI, allowCommercial, allowModification, ...)
- verificationCount: Int (tracks AI platform access attempts)
- lastVerifiedAt: DateTime
- revokedAt: DateTime (null = active)
```

**AIRegistryMonitor**: Monitoring configuration
```sql
- stampId: String (FK to Stamp)
- monitoringPlatforms: JSON (enabled platforms and status)
- scanFrequency: String (hourly | daily | weekly | monthly)
- nextScanAt: DateTime (when next scan runs)
- isActive: Boolean
```

**AITrainingDetection**: Detected unauthorized training
```sql
- stampId: String (FK to Stamp)
- platform: String (hugging_face | replicate | civitai | ...)
- modelId: String (model identifier on platform)
- modelName: String
- modelUrl: String
- detectionMethod: String (hash_match | embedding_similarity | metadata_analysis)
- confidence: Float (0-1)
- responseStatus: String (new | investigating | contacted | resolved)
- reportedAt: DateTime
```

**TrainingDataAudit**: Detailed usage evidence
```sql
- stampId: String (FK to Stamp)
- auditType: String (usage_in_dataset | model_training | fine_tuning)
- platform: String
- evidence: JSON (raw evidence data)
- severity: String (low | medium | high | critical)
- actionTaken: String
```

## Background Jobs

### AI Registry Scan Job
- **Frequency**: Every 6 hours
- **Function**: Scan all enabled AI monitoring stamps
- **Detection**: Searches for stamps in datasets/models
- **Notification**: Alerts creators when unauthorized usage detected
- **Action**: Automatically creates detections for legal action

Configure via environment:
```bash
AI_REGISTRY_SCAN_INTERVAL=6h  # hours between scans
AI_REGISTRY_BATCH_SIZE=50     # stamps scanned per run
```

## Microservices

### Deepfake Detection Service (Python)

Runs on port 5000 as separate Flask microservice:

```bash
python stego-service/deepfake_detection.py
```

**Endpoints:**
- `/analyze/face-consistency` - Face anomaly detection
- `/analyze/deepfake-score` - Deepfake likelihood
- `/analyze/ai-generated` - AI generation detection
- `/analyze/artifacts` - Compression/forensic analysis
- `/analyze/compare` - Comparison with original
- `/video/extract-frames` - Video frame extraction

**Environment:**
```bash
DEEPFAKE_DETECTION_SERVICE_URL=http://localhost:5000
```

## Implementation Roadmap

### Phase 1: Implemented ✅
- ✅ AI Access Token generation and verification
- ✅ AI Registry monitoring (Hugging Face, Replicate, CivitAI, Kaggle)
- ✅ Training detection infrastructure
- ✅ Deepfake detection framework
- ✅ Audit and notification systems

### Phase 2: In Development 🔄
- 🔄 Complete deepfake detection ML models
- 🔄 Audio/video fingerprinting
- 🔄 C2PA full embed+verify workflow
- 🔄 Fair use detection filtering

### Phase 3: Coming Soon 📅
- 📅 Dark web monitoring
- 📅 Blockchain marketplace scanning
- 📅 Auto-takedown for all platforms
- 📅 Litigation dashboard
- 📅 Advanced analytics

## Best Practices

### For Creators

1. **Enable AI Opt-Out Registry**
   - Create stamp
   - Go to AI Protection tab
   - Enable "Prevent AI Training" (default ON)
   - Generates auto-public entry in `/registry`

2. **Set Up Monitoring**
   - Enable registry monitoring (weekly)
   - Receive notifications if work detected
   - Review detections in dashboard
   - Report to platforms with one click

3. **License Your Work**
   - Choose appropriate license type
   - Generate access token if allowing some AI use
   - Share restrictions with platforms
   - Revoke token if policy changes

4. **Track Evidence**
   - Export detection history regularly
   - Store in safe location
   - Use for legal proceedings
   - Share with lawyers

### For Platform Integration (AI Model Creators)

1. **Check License Before Training**
   ```python
   import requests
   
   # Verify if content can be used for training
   response = requests.post('https://api.proofstamp.app/ai-protection/verify-token', 
     json={'token': user_token})
   
   if not response.json()['allowTraining']:
     # Don't use in training
     pass
   ```

2. **Respect Opt-Out Registry**
   ```python
   # Check if work is protected
   response = requests.get('https://api.proofstamp.app/registry/check',
     params={'hash': file_sha256, 'phash': perceptual_hash})
   
   if response.json()['protected']:
     # Exclude from training
     pass
   ```

3. **Implement robots.txt directives**
   ```
   User-Agent: anthropic-ai
   Disallow-Training: /
   ```

## Support & Legal

For legal questions about AI training protection in India:
- Email: legal@proofstamp.app
- WhatsApp: +91-XXX-XXXX-XXXX
- Documentation: https://docs.proofstamp.app

## Compliance Verification

All timestamps verified against Indian Government standards:
- TSA Provider: Digital Signature algorithms per DISHA standards
- Blockchain: OpenTimestamps (ISO 18014-3)
- Jurisdiction: India (applicable throughout)

---

**ProofStamp** - Trust Built on Law, Technology, and Time.
