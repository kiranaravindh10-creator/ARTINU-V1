# Firebase Pricing Tier for 5TB Scale — Confirmation

## Verdict: **Blaze (Pay-as-you-go) Plan Required**

The **Spark (Free) plan** caps at **5 GB storage** and **1 GB/day egress** — insufficient for 5 TB.

**Blaze plan** is the only option for production at this scale.

---

## Blaze Plan Pricing (2024 Rates, us-central1)

| Component | Rate | 5TB Estimate |
|-----------|------|--------------|
| **Storage (Standard)** | $0.026/GB/month | 5,120 GB × $0.026 = **$133.12/month** |
| **Storage (Nearline, >90 days)** | $0.010/GB/month | See lifecycle rules |
| **Storage (Coldline, >365 days)** | $0.004/GB/month | See lifecycle rules |
| **Network Egress (Americas/APAC/EMEA)** | $0.12/GB | ~$60/month (est.) |
| **Network Egress (Inter-region)** | $0.01–0.08/GB | Minimal |
| **Operations (Class A - write/list)** | $0.05/10k ops | ~$5/month |
| **Operations (Class B - read)** | $0.004/10k ops | ~$2/month |
| **Firebase Hosting (if used)** | $0.026/GB + $0.15/GB egress | Separate |

**Estimated Monthly: $155–200/month** (with lifecycle + CDN)

---

## What Blaze Unlocks at Scale

| Feature | Spark | Blaze |
|---------|-------|-------|
| Storage | 5 GB | Unlimited (pay per GB) |
| Egress | 1 GB/day | Unlimited (pay per GB) |
| Cloud Functions | ❌ | ✅ (2M free/mo) |
| Cloud Run | ❌ | ✅ |
| Custom Domains | ✅ | ✅ |
| Multiple Sites | ❌ | ✅ |
| **Budget Alerts** | ❌ | ✅ |
| **Lifecycle Rules** | ❌ | ✅ |
| **Cloud Armor / CDN** | ❌ | ✅ |

---

## Pre-Launch Checklist

- [ ] **Upgrade to Blaze plan** in Firebase Console → Project Settings → Usage and billing
- [ ] **Link billing account** with sufficient quota (request quota increase if needed)
- [ ] **Enable Cloud CDN** for Firebase Storage:
  ```bash
  # Firebase Storage uses Google Cloud Storage backend
  # CDN is automatically enabled for public objects
  # Verify: curl -I https://storage.googleapis.com/your-bucket/hero/slide.jpg
  # Should show: "Cache-Control: public, max-age=3600, must-revalidate"
  # And: "Age: <seconds>" header from CDN
  ```
- [ ] **Apply lifecycle rules** (see `FIREBASE_LIFECYCLE_RULES.md`)
- [ ] **Configure budget alerts** (see `FIREBASE_BUDGET_ALERTS.md`)
- [ ] **Request egress quota increase** if expecting >10 TB/month:
  - GCP Console → IAM & Admin → Quotas → Cloud Storage → Egress
- [ ] **Set up monitoring dashboard** for storage size, egress, operations
- [ ] **Test cache invalidation** for manager-updated assets (hero slides, cafes):
  - Manager updates → new file path (not overwrite) → CDN serves new file immediately
  - Verify `Age` header resets on new upload

---

## Cost Optimization at 5TB

| Strategy | Savings |
|----------|---------|
| Lifecycle: STANDARD→NEARLINE (90d) | ~30% storage cost |
| Lifecycle: NEARLINE→COLDLINE (365d) | ~60% storage cost |
| CDN cache hit rate 90%+ | ~90% egress reduction |
| Immutable paths (no overwrites) | Eliminates stale cache |
| Compress images at upload (WebP/AVIF) | 30-50% storage reduction |

**With all optimizations: ~$95–120/month** vs $200+ without.

---

## Confirmation

**This setup uses:**
- ✅ Blaze (pay-as-you-go) plan
- ✅ Firebase Storage backed by Cloud Storage (Standard/Nearline/Coldline)
- ✅ Cloud CDN automatically for public objects
- ✅ Lifecycle rules for tiered storage
- ✅ Budget alerts at 50%/80%/100%
- ✅ Immutable upload paths (UUID-based) to avoid cache staleness
- ✅ Folder-specific cache-control headers

**No code changes needed** for Blaze — same SDK, same API. Just billing account linkage.