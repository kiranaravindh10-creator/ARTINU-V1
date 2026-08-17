# Firebase Storage Lifecycle Rules for ARTINU (5TB Scale)

Apply with: `gsutil lifecycle set lifecycle.json gs://<your-bucket>`

```json
{
  "rule": [
    {
      "action": {
        "type": "SetStorageClass",
        "storageClass": "NEARLINE"
      },
      "condition": {
        "age": 90,
        "matchesStorageClass": ["STANDARD"]
      }
    },
    {
      "action": {
        "type": "SetStorageClass",
        "storageClass": "COLDLINE"
      },
      "condition": {
        "age": 365,
        "matchesStorageClass": ["NEARLINE"]
      }
    },
    {
      "action": {
        "type": "Delete"
      },
      "condition": {
        "age": 2555,
        "matchesStorageClass": ["COLDLINE"]
      }
    },
    {
      "action": {
        "type": "Delete"
      },
      "condition": {
        "numNewerVersions": 3,
        "isLive": false
      }
    }
  ]
}
```

## Rule Explanation

| Rule | Purpose |
|------|---------|
| **STANDARD → NEARLINE after 90 days** | Move older assets to cheaper storage class. NEARLINE is ~$0.01/GB/month vs STANDARD ~$0.026/GB/month. Good for photos not accessed in 3+ months. |
| **NEARLINE → COLDLINE after 365 days** | Further reduce cost for archival. COLDLINE is ~$0.004/GB/month. Minimum 90-day storage duration in NEARLINE before transition. |
| **Delete after 7 years (2555 days)** | Compliance/cleanup for very old assets. Adjust based on retention requirements. |
| **Delete non-current versions (keep 3)** | Prevent version accumulation from overwrites. Each overwrite creates a new version; this limits to 3 most recent. |

## Cost Estimation at 5TB

| Storage Class | Cost/GB/month | 5TB Cost/month |
|---------------|---------------|----------------|
| STANDARD | $0.026 | $130 |
| NEARLINE | $0.010 | $50 |
| COLDLINE | $0.004 | $20 |
| ARCHIVE | $0.0012 | $6 |

**With lifecycle rules (assuming 60% active, 30% 90-365 days, 10% 1+ years):**
- ~3 TB STANDARD = $78/month
- ~1.5 TB NEARLINE = $15/month
- ~0.5 TB COLDLINE = $2/month
- **Total storage: ~$95/month** (vs $130 without lifecycle)

## Network Egress (Major Cost at Scale)

| Region | Cost/GB |
|--------|---------|
| Americas/Asia/Europe | $0.12/GB |
| Inter-region | $0.01-0.08/GB |

**At 5TB with CDN (90% cache hit rate):**
- 5TB stored → ~500 GB egress/month (10% cache miss + new uploads)
- Egress cost: ~$60/month

**Total estimated: $155/month** (storage + egress)

## Apply Lifecycle Rules

```bash
# Save the JSON above as lifecycle.json
gsutil lifecycle set lifecycle.json gs://your-project-id.appspot.com

# Verify
gsutil lifecycle get gs://your-project-id.appspot.com
```