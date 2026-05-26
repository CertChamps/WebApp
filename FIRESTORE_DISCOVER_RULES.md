# Firestore + Storage rules: `discover-notes` (community Discover tab)

The Discover tab lets students promote their own **free** notes, study sites, or
revision resources. Listings are public-read so anyone signed in can browse them,
but only the original author (or an admin) can edit or delete a listing.

## Firestore

Collection: `discover-notes/{noteId}`

Document fields:

| Field | Type | Notes |
|-------|------|-------|
| `userId` | string | Author's `auth.uid` |
| `username` | string | Cached for display |
| `userPicture` | string \| null | Cached profile image URL |
| `title` | string | Max 80 chars |
| `description` | string | Max 240 chars |
| `websiteUrl` | string | Validated `https://…` link |
| `thumbnailUrl` | string | Firebase Storage download URL |
| `thumbnailPath` | string | Storage path for cleanup on delete |
| `timestamp` | server timestamp | Created at |

### Suggested rules

Add (or extend) the following block in **Firestore → Rules**:

```
match /discover-notes/{noteId} {
  allow read: if request.auth != null;

  allow create: if request.auth != null
    && request.resource.data.userId == request.auth.uid
    && request.resource.data.title is string
    && request.resource.data.title.size() > 0
    && request.resource.data.title.size() <= 80
    && request.resource.data.description is string
    && request.resource.data.description.size() <= 240
    && request.resource.data.websiteUrl is string
    && request.resource.data.websiteUrl.matches('^https?://.*')
    && request.resource.data.thumbnailUrl is string;

  allow update: if request.auth != null
    && resource.data.userId == request.auth.uid
    && request.resource.data.userId == resource.data.userId;

  allow delete: if request.auth != null
    && (resource.data.userId == request.auth.uid
        || request.auth.token.admin == true);
}
```

> If you don't use a custom `admin` claim, replace the admin check with an
> explicit `uid` list (matching `src/constants/adminUids.ts`) or remove the
> admin branch and delete listings manually from the Firebase console.

## Storage

Thumbnails are uploaded to:

```
discover-thumbnails/{uid}/{timestamp}-{filename}
```

### Suggested storage rules

```
match /discover-thumbnails/{uid}/{file=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && request.auth.uid == uid
    && request.resource.size < 4 * 1024 * 1024
    && request.resource.contentType.matches('image/.*');
  allow delete: if request.auth != null && request.auth.uid == uid;
}
```

Publish both the Firestore and Storage rules before opening the Discover tab in
production.
