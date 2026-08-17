# Firebase/GCP Budget Alerts for ARTINU (5TB Scale)

## Recommended Budget Alerts

Create via GCP Console → Billing → Budgets & alerts, or via `gcloud`:

```bash
# 1. Monthly spend alert (triggers at 50%, 90%, 100%)
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="ARTINU Monthly Spend" \
  --budget-amount=200USD \
  --threshold-rule=percent=0.5,basis=current-spend \
  --threshold-rule=percent=0.9,basis=current-spend \
  --threshold-rule=percent=1.0,basis=current-spend \
  --notification-channel=CHANNEL_ID

# 2. Storage-specific alert (triggers at 4TB, 4.5TB, 5TB)
gcloud logging write "firebase-storage-size" \
  --payload='{"bucket": "your-project-id.appspot.com", "size_bytes": 5000000000000}' \
  --severity=INFO
```

## Budget Thresholds for 5TB Scale

| Alert | Threshold | Amount | Rationale |
|-------|-----------|--------|-----------|
| **Warning** | 50% | $100 | Early heads-up |
| **Critical** | 80% | $160 | Time to investigate |
| **Hard Limit** | 100% | $200 | Should not exceed |
| **Storage Growth** | 4 TB | N/A | Pre-5TB capacity warning |
| **Storage Growth** | 4.5 TB | N/A | Imminent capacity limit |
| **Egress Spike** | 2x baseline | $120 | Detects abnormal traffic |

## Programmatic Budget (Terraform Example)

```hcl
resource "google_billing_budget" "artinu_monthly" {
  billing_account = var.billing_account
  display_name    = "ARTINU Monthly Budget"
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "200"
    }
  }
  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }
  all_updates_rule {
    pubsub_topic = google_pubsub_topic.budget_alerts.id
  }
}

resource "google_billing_budget" "artinu_storage" {
  billing_account = var.billing_account
  display_name    = "ARTINU Storage Budget"
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "150"
    }
  }
  budget_filter {
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
    services = ["cloudstorage.googleapis.com"]
  }
  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "FORECASTED_SPEND"
  }
  all_updates_rule {
    pubsub_topic = google_pubsub_topic.budget_alerts.id
  }
}
```

## Notification Channels

Create Pub/Sub topic for alerts → Cloud Function/Cloud Run service → Slack/Email/PagerDuty:

```bash
# Create notification topic
gcloud pubsub topics create budget-alerts

# Create Slack webhook integration (example)
# See: https://cloud.google.com/billing/docs/how-to/budgets#create_notification_channel
```

## Key Metrics to Monitor (Cloud Monitoring)

```yaml
# Custom dashboard metrics
- metric: storage.googleapis.com/storage/total_bytes
  filter: resource.type="gcs_bucket" AND resource.label.bucket_name="your-project-id.appspot.com"
  aggregation: MAX, period=1d

- metric: storage.googleapis.com/network/egress_bytes_count
  filter: resource.type="gcs_bucket"
  aggregation: SUM, period=1d

- metric: storage.googleapis.com/api/request_count
  filter: resource.type="gcs_bucket" AND metric.label.method="GET"
  aggregation: SUM, period=1d
```

## Alert Policies (gcloud)

```bash
# Storage size alert
gcloud alpha monitoring policies create --policy-from-file=storage-size-alert.yaml

# Egress spike alert
gcloud alpha monitoring policies create --policy-from-file=egress-spike-alert.yaml
```

**storage-size-alert.yaml:**
```yaml
displayName: "ARTINU Storage Size > 4.5 TB"
conditions:
  - displayName: "Bucket size exceeds 4.5 TB"
    conditionThreshold:
      filter: 'resource.type="gcs_bucket" AND resource.label.bucket_name="your-project-id.appspot.com" AND metric.type="storage.googleapis.com/storage/total_bytes"'
      comparison: COMPARISON_GT
      thresholdValue: 4950000000000
      duration: 300s
      aggregations:
        - alignmentPeriod: 300s
          perSeriesAligner: ALIGN_MAX
alertStrategy:
  autoClose: 86400s
notificationChannels:
  - projects/PROJECT_ID/notificationChannels/CHANNEL_ID
```