# Firebase Storage CORS setup

Your PDFs are blocked because the Storage bucket doesn't send CORS headers. Do this once in **Google Cloud Shell** (no local install).

## Steps

### 1. Open Cloud Shell

1. Go to: **https://console.cloud.google.com**
2. Log in with the Google account that owns the Firebase project.
3. Select project **certchamps-a7527** (top bar).
4. Click the **terminal icon** (Activate Cloud Shell) in the top-right. A terminal opens at the bottom.

### 2. Create the CORS config file (do this first)

In Cloud Shell, **paste this whole block and press Enter** (it creates `cors.json` in your home directory).

**If you only use the app on this machine (localhost):** use this as-is:

```bash
cat > cors.json << 'EOF'
[{"origin":["http://localhost:5173","http://localhost:3000","http://127.0.0.1:5173","https://certchamps-a7527.web.app","https://certchamps-a7527.firebaseapp.com"],"method":["GET","HEAD"],"responseHeader":["Content-Type","Content-Length"],"maxAgeSeconds":3600}]
EOF
```

**If you open the app on other devices (e.g. iPad) via the network:** when you run `npm run dev`, Vite prints a **Network** URL like `http://192.168.1.100:5173`. You must add that exact origin to CORS or PDFs will not load on the iPad. Create the file with your URL included (replace `http://192.168.1.100:5173` with the URL Vite shows for *your* machine):

```bash
cat > cors.json << 'EOF'
[{"origin":["http://localhost:5173","http://localhost:3000","http://127.0.0.1:5173","http://192.168.1.100:5173","https://certchamps-a7527.web.app","https://certchamps-a7527.firebaseapp.com"],"method":["GET","HEAD"],"responseHeader":["Content-Type","Content-Length"],"maxAgeSeconds":3600}]
EOF
```

Check it exists: `ls cors.json` — you should see `cors.json` in the list.

### 3. Set the project (if needed)

```bash
gcloud config set project certchamps-a7527
```

If Cloud Shell asks to enable an API, confirm. If it says you need to run `gcloud auth login`, run it and complete the browser flow.

### 4. Apply CORS to the bucket

Try the firebasestorage bucket first:

```bash
gcloud storage buckets update gs://certchamps-a7527.firebasestorage.app --cors-file=cors.json
```

- If you see **"Bucket not found"** or an error, try the appspot bucket:

```bash
gcloud storage buckets update gs://certchamps-a7527.appspot.com --cors-file=cors.json
```

One of these should succeed. You should see a short message that the bucket was updated.

### 5. Done

- Wait about 1 minute.
- Hard-refresh your app (Ctrl+Shift+R) or reopen the tab.
- In Past paper mode, select a paper again — the PDF should load.

---

## PDFs don’t load on iPad (or another device on your network)

When you open the app on your iPad using the **Network** URL from `npm run dev` (e.g. `http://192.168.1.100:5173`), the browser sends that URL as the **origin** to Firebase Storage. If that origin isn’t in the bucket’s CORS list, the browser blocks the response and PDFs won’t load.

**Fix:** Add the exact URL you use on the iPad to CORS, then re-apply.

1. In the terminal where you run `npm run dev`, note the **Network** URL (e.g. `http://192.168.1.100:5173`). Use the IP of your *dev machine*, not the iPad.
2. In Cloud Shell, create a new `cors.json` that includes that origin (see **step 2** above — use the second block and replace `192.168.1.100` with your machine’s IP if different).
3. Run **step 4** again to apply CORS:  
   `gcloud storage buckets update gs://certchamps-a7527.firebasestorage.app --cors-file=cors.json`  
   (or the `.appspot.com` bucket if that’s the one you use).
4. Wait ~1 minute, then reload the app on the iPad and try loading a paper again.

Your IP can change (e.g. after reconnecting to Wi‑Fi). If PDFs stop loading on the iPad, repeat the steps with the new Network URL.

## If you install gcloud locally later

From the WebApp folder:

```bash
cd ~/Documents/CertChamps/WebApp
gcloud auth login
gcloud config set project certchamps-a7527
gcloud storage buckets update gs://certchamps-a7527.firebasestorage.app --cors-file=storage-cors.json
```

(Use `storage-cors.json` in this repo; it has the same content as the `cors.json` above.)
