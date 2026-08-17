# Firebase Storage Setup for ARTINU

## Overview
This document describes the Firebase Storage configuration for ARTINU, replacing Google Drive as the file storage layer. The existing PostgreSQL/Supabase database remains the source of truth for all metadata (users, photos, follows, cafes, etc.). Firebase Storage is used purely for file storage.

## Folder Structure
```
/photographers/{photographerId}/uploads/{photoId}.jpg
/profile/{photographerId}/avatar.jpg
/profile/{photographerId}/cover.jpg
/hero/{slideId}.jpg
/featured/{collectionId}/{photoId}.jpg
/cafes/{cafeId}.jpg
/collaborations/{slideId}.jpg
/artworks/{photoId}.jpg (legacy)
/spaces/{spaceId}.jpg (legacy)
/thumbnails/{photoId}.jpg
/documents/{docId}
/invoices/{invoiceId}
```

## Security Rules
See `firebase.storage.rules` for the complete security rules.

### Key Access Patterns:
- **Photographers**: Can read/write/delete their own uploads in `/photographers/{photographerId}/uploads/`
- **Profile images**: Photographers can write their own avatar/cover in `/profile/{photographerId}/`
- **Manager/Admin (ceo, manager, operations, accounts, it_team)**: Full write access to hero, featured, cafes, collaborations paths
- **Public read**: Active hero slides, featured collections, cafe images, collaboration slides, artworks, spaces are publicly readable
- **Internal only**: Documents, invoices, thumbnails

## Environment Variables
Add these to your `.env` file:

```bash
# Firebase Storage
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXXXXXXX\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# Storage driver
STORAGE_DRIVER=firebase
```

## Deployment

### 1. Enable Firebase Storage
```bash
firebase init storage
# Select your project
# Accept default rules file (we'll replace with our custom rules)
```

### 2. Deploy Security Rules
```bash
firebase deploy --only storage
```

### 3. Configure Service Account
1. Go to Firebase Console > Project Settings > Service Accounts
2. Generate new private key
3. Add credentials to environment variables

## Migration from Google Drive
The old Google Drive mirror is deprecated. Existing files in Google Drive should be migrated to Firebase Storage using the same folder structure. The `GOOGLE_SERVICE_ACCOUNT_KEY` and `GOOGLE_DRIVE_ROOT_FOLDER_ID` environment variables are kept for migration purposes only.

## Storage Limits
- Photographer uploads: 12 MB max, JPEG/PNG/WebP/AVIF only
- Profile/Cover images: 5 MB max
- All uploads validated by magic bytes (not just MIME type)

## API Integration
The storage service (`server/src/services/storage.service.ts`) handles all uploads via the `storeBase64()` and `storeImage()` functions. The `STORAGE_DRIVER=firebase` environment variable activates the Firebase driver.

### Example Upload Flow:
1. Client sends base64 data URL to `/api/upload` or specific endpoints
2. Server validates file type, size, and magic bytes
3. Server uploads to Firebase Storage at appropriate path
4. Server makes file publicly readable (for published assets)
5. Server returns public URL and Firebase path
6. Database records store the URL and path for reference

## Monitoring
- Firebase Console > Storage shows usage, bandwidth, and file counts
- Set up budget alerts for the 5TB scale target
- Monitor security rule evaluation logs for unauthorized access attempts