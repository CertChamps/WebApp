# Firestore rules: predictions collection

Predictions are stored at:

```
questions/leavingcert/predictions/{predictionId}
questions/leavingcert/predictions/{predictionId}/questions/{questionId}
```

The app tries **direct Firestore writes** first (same as Add Questions). If that is denied, it falls back to the `savePredictedPaper` Cloud Function.

## Required rules (Firebase console → Firestore → Rules)

Add an `isAdmin()` helper if you do not already have one, then allow admins to read/write predictions:

```
function isAdmin() {
  return request.auth != null && (
    request.auth.uid in [
      'NkN9UBqoPEYpE21MC89fipLn0SP2',
      'gJIqKYlc1OdXUQGZQkR4IzfCIoL2',
      'AN3cIuQxmXfXb5kEmXuHcM5vWyH3'
    ] ||
    request.auth.token.email == 'cian.brady@certchamps.ie' ||
    get(/databases/$(database)/documents/user-data/$(request.auth.uid)).data.isAdmin == true
  );
}

match /questions/leavingcert/predictions/{predictionId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update, delete: if isAdmin();

  match /questions/{questionId} {
    allow read: if request.auth != null;
    allow create: if request.auth != null;
  allow update, delete: if isAdmin();
  }
}
```

**Publish** the rules, then save again from the app — no Cloud Function deploy needed.

## Optional: Cloud Function fallback

If you prefer server-side writes only:

```bash
firebase deploy --only functions:savePredictedPaper
```

Then set `allow write: if false` on the predictions paths above (reads still allowed for signed-in users).
