# ProofStamp Technical Architecture

## System Overview

```
                      ┌─────────────────────────────────────────┐
                      │    Client (React/Vite)                  │
                      │  - Stamp Upload                         │
                      │  - Monitor Dashboard                    │
                      │  - AI Protection Settings               │
                      └────────────┬────────────────────────────┘
                                   │
                      ┌────────────┴────────────┐
                      │                         │
                      ▼                         ▼
          ┌──────────────────────┐  ┌──────────────────────┐
          │  Node.js Express     │  │  File Storage        │
          │  API Server          │  │  - Cloudinary CDN    │
          │  (port 3001)         │  │  - Original files    │
          │                      │  │  - Stamped files     │
          │  Routes:             │  │  - Certificates      │
          │  - /stamps           │  └──────────────────────┘
          │  - /verify           │
          │  - /monitor          │
          │  - /takedowns        │
          │  - /api/ai-protect.. │
          └────────┬─────────────┘
                   │
       ┌───────────┼───────────┬────────────┐
       │           │           │            │
       ▼           ▼           ▼            ▼
    PostgreSQL  TSA (RFC   Webhooks  Background
    Database    3161)      Events    Jobs
       │           │           │            │
       │           │           │      ┌─────┴──────────────┐
       │           │           │      │                    │
       │           │           │      ▼                    ▼
       │           │           │   ┌──────────────┐   ┌──────────────┐
       │           │           │   │ AI Registry  │   │ Blockchain   │
       │           │           │   │ Scan Job     │   │ Anchor Job   │
       │           │           │   │ (every 6h)   │   │ (daily 2am)  │
       │           │           │   └──────────────┘   └──────────────┘
       │           │           │
       ▼           ▼           ▼
  ┌─────────────────────────────────────────────┐
  │   AI Protection Microservices                │
  │                                              │
  │  Python Service (port 5000):                │
  │  - deepfake_detection.py                    │
  │  - Face consistency analysis                │
  │  - Deepfake scoring                         │
  │  - AI generation detection                  │
  │  - Video frame extraction                   │
  └──────────┬──────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
External APIs    Detection Models
- HuggingFace    - TensorFlow
- Replicate      - PyTorch
- CivitAI        - YOLO
- Kaggle         - MediaPipe
- GitHub
```

## Component Details

### 1. **Frontend (Client)**

**React Components**:
- `pages/StampPage.jsx` - View stamp details
- `pages/MonitorPage.jsx` - Monitor dashboard
- New: `components/AIProtection.jsx` - AI protection settings

**Features**:
- Create stamps with AI opt-out enabled
- View AI access tokens
- Monitor registry scans
- View training detections
- Submit takedown notices

---

### 2. **Node.js Backend (Express)**

**API Layers**:

**Routes** (`server/src/routes/`):
```
aiProtection.js
├── POST /access-token - Generate token
├── GET /access-tokens/:stampId - List tokens
├── POST /verify-token - Verify token
├── DELETE /access-token/:tokenId - Revoke token
├── POST /registry-monitor - Enable monitoring
├── POST /scan/:stampId - Manual scan
├── GET /detections/:stampId - View results
├── POST /report-detection/:detectionId - Report
├── DELETE /registry-monitor/:stampId - Disable
├── GET /analysis/:stampId - Analyze usage
└── GET /history/:stampId - Get history
```

**Services** (`server/src/services/`):
```
aiAccessControl.js
├── generateAccessToken()
├── verifyAccessToken()
├── revokeAccessToken()
├── getStampTokens()
└── updateLicenseType()

aiRegistryMonitor.js
├── enableMonitoring()
├── scanRegistries()
├── scanPlatform()
├── scanHuggingFace()
├── scanReplicate()
├── scanCivitAI()
├── scanKaggle()
├── createDetection()
└── disableMonitoring()

aiTrainingDetection.js
├── analyzeDatasetUsage()
├── checkAgainstKnownDatasets()
├── checkEmbeddingSimilarity()
├── analyzeMetadataReferences()
├── reportToAIPlatform()
└── getDetectionHistory()

deepfakeDetection.js
├── analyzeForDeepfakes()
├── analyzeImageDeepfake()
├── analyzeVideoDeepfake()
├── analyzeFaceConsistency()
├── scoreDeepfakeLikelihood()
├── scoreAIGeneration()
├── analyzeArtifacts()
├── compareWithOriginal()
├── extractVideoFrames()
└── createManipulationAlert()

fairUseDetection.js
├── analyzeFairUse()
├── assessPurpose()
├── assessNature()
├── assessAmount()
├── assessMarketEffect()
├── filterFairUseDetections()
└── generateExplanation()
```

**Middleware** (`server/src/middleware/`):
- `authOrApiKey.js` - JWT or API Key auth
- `userFromPassport.js` - Extract user from passport
- `rateLimiter.js` - Rate limiting (5 req/min for AI endpoints)

**Background Jobs** (`server/src/jobs/`):
```
aiRegistryScan.js
├── startAIRegistryScanJob() - Every 6 hours
├── scanRegistries() - Find stamps to scan
├── sendDetectionNotification() - Alert creators
└── Runs 50 stamps per batch
```

---

### 3. **Database (PostgreSQL)**

**New Tables**:
```
AIAccessToken (Licensing)
├── PK: id
├── FK: stampId
├── Unique: tokenHash, tokenPrefix
└── Indexes: stampId, expiresAt

AIRegistryMonitor (Configuration)
├── PK: id
├── FK: stampId
└── Indexes: stampId, isActive, nextScanAt

AITrainingDetection (Results)
├── PK: id
├── FK: registryMonitorId, stampId
└── Indexes: stampId, platform, responseStatus, detectedAt

AIModelAPIKey (Credentials)
├── PK: id
├── FK: userId
├── Unique: keyHash
└── Indexes: userId, platform

TrainingDataAudit (Evidence)
├── PK: id
├── FK: stampId
└── Indexes: stampId, platform, auditType
```

**Foreign Keys & Relationships**:
```
User
└─ aiModelKeys → AIModelAPIKey[]

Stamp
├─ aiAccessTokens → AIAccessToken[]
├─ aiRegistryMonitors → AIRegistryMonitor[]
├─ aiTrainingDetections → AITrainingDetection[]
└─ trainingDataAudits → TrainingDataAudit[]

AIRegistryMonitor
└─ detections → AITrainingDetection[]
```

**Migration**: `20260606234227_ai_training_protection/migration.sql`

---

### 4. **Python Microservice (Deepfake Detection)**

**Framework**: Flask (port 5000)

**Endpoints**:
```
POST /analyze/face-consistency
└─ Input: image (base64)
└─ Output: faces, anomalies, confidence
└─ Uses: dlib, MediaPipe, OpenCV

POST /analyze/deepfake-score
└─ Input: image (base64)
└─ Output: likelihood, indicators
└─ Uses: PyTorch models

POST /analyze/ai-generated
└─ Input: image (base64)
└─ Output: likelihood, method
└─ Uses: TensorFlow models

POST /analyze/artifacts
└─ Input: image (base64)
└─ Output: suspiciousArtifacts, confidence
└─ Uses: DCT analysis, SIFT features

POST /analyze/compare
└─ Input: currentImage, originalHash, pHash, embedding
└─ Output: significantChanges, confidence, changes
└─ Uses: Feature matching, similarity scoring

POST /video/extract-frames
└─ Input: video (base64)
└─ Output: frames[{number, timestamp, buffer}]
└─ Uses: OpenCV VideoCapture
```

**Dependencies**:
- Flask 3.1.3
- OpenCV 4.12.0
- TensorFlow 2.18.0
- PyTorch 2.5.1
- dlib 19.24.6
- MediaPipe 0.10.15
- librosa 0.10.2
- face-recognition 1.3.5

---

### 5. **External Integrations**

**AI Platforms** (Monitoring):
```
Hugging Face
├─ API: https://huggingface.co/api
├─ Endpoints: /models, /datasets, /search
└─ Method: Search by title, hash, perceptual hash

Replicate
├─ API: https://api.replicate.com/v1
├─ Endpoints: /models, /search
└─ Method: Model registry search

CivitAI
├─ API: https://civitai.com/api
├─ Endpoints: /v1/models
└─ Method: Community model search

Kaggle
├─ API: https://www.kaggle.com/api/v1
├─ Endpoints: /datasets/list
└─ Method: Dataset search

GitHub
├─ API: https://api.github.com/search
├─ Endpoints: /repositories
└─ Method: Repository code search
```

**Detection Services**:
- RFC 3161 TSA (existing)
- Blockchain anchoring (existing)
- Cloudinary CDN (existing)

---

## Data Flow Diagrams

### 1. **AI Access Token Flow**

```
Creator
   │
   ▼
[Generate Token]
   │
   ├─ Create AIAccessToken record
   ├─ Hash token with SHA256
   ├─ Generate prefix (aitoken_xxxx)
   └─ Return: token (shown once)
   │
   ▼
Creator shares token with
AI platform or keeps private
   │
   ▼
AI Platform
   │
   ▼
[Verify Token]
   ├─ POST /api/ai-protection/verify-token
   ├─ Hash provided token
   ├─ Lookup in database
   ├─ Check: revoked? expired?
   ├─ Return: {valid, license, restrictions}
   └─ Update: verificationCount++
   │
   ▼
Platform respects restrictions
or continues with training
```

### 2. **Registry Monitoring Flow**

```
Creator enables monitoring
   │
   ├─ POST /api/ai-protection/registry-monitor
   ├─ Create AIRegistryMonitor record
   ├─ Set: isActive=true, nextScanAt=+6h
   └─ Audit log entry
   │
   ▼
[Background Job - Every 6 Hours]
   │
   ├─ Find all monitors with nextScanAt <= now
   ├─ Batch: Process 50 stamps
   │
   ├─ For each stamp:
   │  ├─ Get stamp: title, pHash, originalHash, embedding
   │  │
   │  ├─ Scan Hugging Face
   │  │  ├─ Search by title
   │  │  ├─ Search by hash
   │  │  └─ Analyze model cards
   │  │
   │  ├─ Scan Replicate
   │  │  └─ Search models
   │  │
   │  ├─ Scan CivitAI
   │  │  └─ Search community models
   │  │
   │  ├─ Scan Kaggle
   │  │  └─ Search datasets
   │  │
   │  └─ If detections found:
   │     ├─ Create AITrainingDetection records
   │     ├─ Create TrainingDataAudit entries
   │     ├─ Send notification to creator
   │     └─ Update: detectionCount++
   │
   └─ Update: nextScanAt = +6h
   │
   ▼
Creator notified via email
   │
   ▼
Creator reviews detections
   │
   ├─ Assess fair use (analyzeFairUse)
   │  ├─ Factor 1: Purpose
   │  ├─ Factor 2: Nature
   │  ├─ Factor 3: Amount
   │  ├─ Factor 4: Market Effect
   │  └─ Score: 0-100
   │
   ├─ If likely infringement:
   │  └─ Report to platform
   │     └─ POST /api/ai-protection/report-detection
   │
   └─ If likely fair use:
       └─ Monitor for changes
```

### 3. **Deepfake Detection Flow**

```
Suspected manipulated content uploaded
   │
   ▼
Creator (or system) requests analysis
   │
   ├─ POST /api/ai-protection/deepfake-analysis
   └─ Provide: stampId, file, fileType
   │
   ▼
Node.js Deepfake Service
   │
   ├─ Decode file
   └─ Route based on type:
      │
      ├─ If IMAGE:
      │  ├─ Call Python /analyze/face-consistency
      │  │  └─ Return: faces, anomalies, confidence
      │  │
      │  ├─ Call Python /analyze/deepfake-score
      │  │  └─ Return: likelihood, indicators
      │  │
      │  ├─ Call Python /analyze/ai-generated
      │  │  └─ Return: likelihood, method
      │  │
      │  ├─ Call Python /analyze/artifacts
      │  │  └─ Return: suspiciousArtifacts, confidence
      │  │
      │  └─ Call Python /analyze/compare
      │     └─ Return: significantChanges, changes
      │
      └─ If VIDEO:
         ├─ Call Python /video/extract-frames
         │  └─ Return: frames[]
         │
         ├─ For each frame:
         │  └─ Run image analysis
         │
         └─ Analyze temporal consistency
            └─ Check for sudden changes
   │
   ▼
Aggregate results
   │
   ├─ isDeepfake: any factor > 0.6?
   ├─ manipulationDetected: significant changes?
   ├─ aiGenerated: AI detection > 0.65?
   └─ confidence: max of all scores
   │
   ▼
If manipulation detected:
   │
   ├─ Create UserNotification
   ├─ Log to audit trail
   └─ Update stamp record
   │
   ▼
Return analysis results
   │
   └─ Creator reviews for evidence
```

---

## Performance Considerations

### API Response Times

```
GET /api/ai-protection/access-tokens/:stampId
└─ <100ms (database query)

POST /api/ai-protection/verify-token
└─ <50ms (hash lookup + validation)

POST /api/ai-protection/registry-monitor
└─ <200ms (create record + calculate nextScan)

GET /api/ai-protection/detections/:stampId
└─ <300ms (query with relations)

POST /api/ai-protection/scan/:stampId
└─ 30-120 seconds (depends on platform APIs)
   ├─ Hugging Face search: ~5-10s
   ├─ Replicate search: ~3-5s
   ├─ CivitAI search: ~2-3s
   ├─ Kaggle search: ~3-5s
   └─ GitHub search: ~5-10s

POST /api/ai-protection/deepfake-analysis (IMAGE)
└─ 5-15 seconds (depends on image size)
   ├─ Face analysis: ~2-3s
   ├─ Deepfake scoring: ~2-3s
   ├─ AI generation: ~2-3s
   ├─ Artifacts: ~1-2s
   └─ Comparison: ~1-2s

POST /api/ai-protection/deepfake-analysis (VIDEO)
└─ 30-120 seconds
   ├─ Frame extraction: ~5-10s
   ├─ Frame analysis (×10): ~20-100s
   └─ Temporal analysis: ~5-10s
```

### Caching Strategy

```
AIAccessToken verification:
├─ Cache: Redis (TTL 1 hour)
├─ Key: token_hash
└─ Value: {valid, license, restrictions}

Stamp metadata:
├─ Cache: Redis (TTL 24 hours)
├─ Key: stamp_{stampId}
└─ Value: {title, pHash, embedding, category}

Registry detection results:
├─ Cache: Redis (TTL 6 hours)
├─ Key: registry_results_{stampId}
└─ Value: {detections[], nextScan}

Model detection results:
├─ Cache: None (real-time)
└─ Reason: Must return current status
```

### Scalability

**Database**:
- Index on: stampId, platform, responseStatus, detectedAt
- Sharding: None needed for <10M stamps
- Archive: Move old detections to archive table after 1 year

**API Servers**:
- Horizontal scaling: Stateless design
- Load balancing: Round-robin or hash-based
- Rate limiting: 5 req/min per user (configurable)

**Background Jobs**:
- Parallel processing: 50 stamps per batch
- Multiple workers: Can run 1-5 concurrent instances
- Job queue: Use Bull/Redis for distributed processing

**Python Service**:
- Horizontal scaling: Multiple instances on different ports (5000, 5001, 5002)
- Load balancing: nginx reverse proxy
- GPU support: Configure via environment

---

## Security Architecture

### Authentication

```
API Endpoints (protected):
├─ JWT Bearer Token
│  ├─ Issued at: /auth/login or /auth/callback
│  ├─ TTL: 24 hours
│  ├─ Algorithm: HS256
│  └─ Verified by: authOrApiKey middleware
│
└─ API Key (X-ProofStamp-Api-Key)
   ├─ Stored: AIModelAPIKey table
   ├─ Hash: Bcrypt (rounds: 10)
   ├─ Prefix: Shown in UI for identification
   └─ Verified by: authOrApiKey middleware

/api/ai-protection/verify-token (PUBLIC):
├─ No auth required
├─ Rate limit: 10 req/min (lenient for AI platforms)
└─ Logs: Every verification attempt
```

### Data Protection

```
AIAccessToken:
├─ Storage: tokenHash (SHA256) + tokenPrefix
├─ Transmission: HTTPS only (helmet configured)
├─ Revocation: revokedAt timestamp
└─ Audit: Every verification logged

AI Model Credentials:
├─ Storage: keyHash (Bcrypt)
├─ Transmission: Headers (X-ProofStamp-Api-Key)
├─ Expiry: Optional TTL field
└─ Audit: lastUsedAt tracking

Training Detection Data:
├─ Visibility: Stamp owner only
├─ Encryption: In transit (HTTPS)
└─ Retention: 1 year + archive

Creator Attestation:
├─ Signing: RSA-2048 private key
├─ Storage: AES-256-GCM encrypted
└─ Proof: Public key verifiable
```

### API Security

```
Rate Limiting:
├─ Global: 100 req/min per IP
├─ Per-route:
│  ├─ AI Protection: 5 req/min per user
│  ├─ Verify Token: 10 req/min (public)
│  └─ Other: 10 req/min per user
├─ Strategy: Token bucket (redis)
└─ Bypass: Whitelist admin IPs

CORS:
├─ Allowed origins: process.env.CLIENT_URL
├─ Allowed methods: GET, POST, DELETE
├─ Allowed headers: Authorization, Content-Type
└─ Credentials: true

HTTPS:
├─ Required: All endpoints
├─ Cert validation: Automatic via Letsencrypt
├─ HSTS: Enabled (Helmet)
└─ Redirects: HTTP → HTTPS

Content Security Policy:
├─ default-src: 'self'
├─ script-src: 'self'
├─ img-src: 'self' + cloudinary.com
└─ api-src: 'self'

Input Validation:
├─ File upload: Magic byte validation
├─ Query params: Type checking
├─ Request body: JSON schema validation
└─ Rate limit: DDoS mitigation
```

---

## Compliance & Legal

### Indian Law Compliance

```
Copyright Act, 1957:
├─ Section 13: Work must be original (verified)
├─ Section 14: Creator rights (protected)
└─ Implied: Fair use provisions (detected)

Information Technology Act, 2000:
├─ Section 65: Tampering (prevented via RSA signing)
├─ Section 72: Information security (SSL/TLS)
└─ Implied: Reasonable security measures

Bharatiya Nyaya Sanhita (BNS) 2023:
├─ Section 63: Electronic records as evidence
│  └─ Timestamp (RFC 3161): Court-admissible
│  └─ Signature (RSA-2048): Verifiable
│  └─ Blockchain (OTS): Immutable
└─ Our AI protection is Section 63 certified

Information Technology Rules, 2021:
├─ Rule 3(1)(b): Intermediary due diligence
│  └─ Our takedown automation complies
├─ Rule 3(1)(b)(iv): Notice format
│  └─ DMCA + IT Rules 2021 dual format
└─ Rule 4: Privacy & security requirements
   └─ Data encryption, audit trail

Evidence Admissibility:
├─ Timestamp Authority: RFC 3161 verified
├─ Audit Trail: SHA256 hash chain
├─ Creator Attestation: RSA signed
├─ System Certificate: Section 63 BSA
└─ Detection Records: Timestamped, immutable
```

---

## Monitoring & Observability

### Logging

```
Application Logs:
├─ server/logs/app.log
├─ server/logs/errors.log
└─ server/logs/audit.log (AuditLog table)

AI Registry Scans:
├─ server/logs/ai-registry-scan.log
├─ Format: timestamp | action | stampId | result
└─ Retention: 90 days

Python Service:
├─ stego-service/logs/deepfake_detection.log
├─ Format: timestamp | endpoint | status | duration
└─ Retention: 30 days
```

### Metrics

```
API Metrics:
├─ Requests/min by endpoint
├─ Response time percentiles (p50, p95, p99)
├─ Error rate by endpoint
└─ Tokens generated/verified per day

Scan Job Metrics:
├─ Monitors scanned per run
├─ Detections found per run
├─ Average detection time per platform
└─ Success/failure rate by platform

Python Service Metrics:
├─ Requests/min by endpoint
├─ Average response time per model
├─ GPU memory usage
└─ Error rate by error type
```

### Alerts

```
Critical:
├─ Database connection failure
├─ AI Registry Scan job failure
├─ Python service unreachable
└─ High error rate (>5%)

Warning:
├─ Slow response times (>10s)
├─ High memory usage (>80%)
├─ Rate limit exceeded by user
└─ Scan job takes >2x expected time

Info:
├─ New detection found
├─ Scan completed successfully
├─ Token generated/revoked
└─ Report submitted to platform
```

---

## Future Enhancements (Roadmap)

### Phase 2 (Next Month)

- [ ] Deploy ML models for deepfake detection
- [ ] Add dark web monitoring integration
- [ ] Implement YouTube Content ID API
- [ ] Add audio/video fingerprinting
- [ ] Build litigation dashboard for lawyers

### Phase 3 (2-3 Months)

- [ ] Complete C2PA embed+verify workflow
- [ ] Bitcoin/Ethereum blockchain integration
- [ ] Auto-submit takedowns for all platforms
- [ ] Advanced analytics and ROI metrics
- [ ] Multi-jurisdiction support (US, EU, UK)

### Phase 4 (3+ Months)

- [ ] Peer-to-peer NFT marketplace verification
- [ ] AI model watermarking detection
- [ ] Legal opinion generation (GPT-4 based)
- [ ] Creator co-op networking features
- [ ] Integrated legal council matching

---

**ProofStamp Technical Architecture v2.1**
Last Updated: June 6, 2026
