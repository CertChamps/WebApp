# Firestore rules: predictions collection (per-user)

Predictions are now **personal to each signed-in user**. They are stored under the user's
`user-data` namespace, so a user can only ever see / generate / delete their own predictions:

```
user-data/{uid}/predictions/{predictionId}
user-data/{uid}/predictions/{predictionId}/questions/{questionId}
```

The app tries **direct Firestore writes** first (same as Add Questions). If that is denied,
it falls back to the `savePredictedPaper` Cloud Function, which writes to the same per-user
path using the verified id token.

## Required rules (Firebase console → Firestore → Rules)

Add (or extend) the `user-data/{userId}/predictions` block so each user has full read/write
access to their own predictions and nothing else:

```
match /user-data/{userId}/predictions/{predictionId} {
  allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;

  match /questions/{questionId} {
    allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
  }
}
```

**Publish** the rules, then save again from the app — no Cloud Function deploy needed.

## Optional: Cloud Function fallback

If you prefer server-side writes only:

```bash
firebase deploy --only functions:savePredictedPaper
```

Then set `allow create, update, delete: if false` on the predictions paths above (reads
should still be allowed for `request.auth.uid == userId`). The Cloud Function uses the
Admin SDK so it can still write while client writes are denied.

## Migration note

When predictions lived at `questions/leavingcert/predictions/{predictionId}` they were
visible to every signed-in user. The collection has been removed; any old rules allowing
that path can be deleted.
