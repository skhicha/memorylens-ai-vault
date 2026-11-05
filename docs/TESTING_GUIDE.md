# MemoryLens AI — Testing Guide

A click-by-click script for testing the app yourself and then demoing it
live to your professor. Pairs with `docs/PRESENTATION_GUIDE.md` (the talking
points) — this doc is just "what to click, in what order, what you should see."

Budget ~10–12 minutes for the full run-through.

---

## 0. Before you start

### Start the two servers (two terminals)

```bash
# Terminal 1 — backend
cd backend
./run.sh
# first run creates a venv and installs requirements — can take a few minutes
# once running you'll see: "Application startup complete."

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# once running you'll see: "Local: http://localhost:5173/"
```

Open **http://localhost:5173** in your browser (Chrome or Safari both fine
on the M1 Air).

### Test data to use

Don't use fake/corrupt files — the pipeline is honest about what it finds,
so the demo is more convincing with real data:

| What | Where to get it | Why |
|---|---|---|
| 2–3 **photos from your own phone** (AirDrop or cable them to the Mac) | Photos app / Camera Roll | Real phone photos almost always carry GPS + camera-model EXIF, which is what makes the Map and Metadata panel worth showing. Pick at least one taken **outdoors in daylight** and one **indoors/at night** so the two tags differ. |
| 1 photo with a **clearly visible human face**, front-on, well lit | Any selfie or portrait | Needed to demonstrate face detection — the Haar-cascade detector is classical CV, not a deep model, so it needs a reasonably frontal, well-lit face to succeed. Don't use a photo of a pet or a crowd shot from far away for the "this is how face detection works" moment. |
| 1 short **video with you or someone talking**, 10–30 seconds, recorded on your phone (talk about anything — even "testing one two three, this is my capstone project") | Camera app | Needed to demonstrate transcription (faster-whisper) and the Ask AI chat citing spoken content. |
| (Optional) 1 video with **no faces and silent/no speech** (e.g. a pan across a room) | Camera app | Good to show honestly — the app should mark faces "0" and transcription "skipped/empty" rather than faking a result. This is a good moment to tell your professor "it never pretends to find something that isn't there." |

Copy these 4–5 files somewhere handy (e.g. a folder on the Desktop) before
you start, so you're not hunting for files mid-demo.

### Create your account once, ahead of time

1. Go to `http://localhost:5173` → it redirects to **/login**.
2. Click **"Create one"**.
3. Fill in a display name, an email (doesn't need to be real — e.g.
   `demo@memorylens.ai`), and a password (**at least 8 characters, with a
   letter and a number** — e.g. `Demo1234`).
4. Click **Create account**. You should land on the (empty) **Library**
   page with your avatar initial in the bottom-left of the sidebar.

Do this once before the actual demo so you're not typing a password live.

---

## 1. Functional test pass (do this yourself first, before showing anyone)

Go through this list and confirm each line. If anything doesn't match,
that's a real bug — fix it before presenting.

### Upload

- [ ] Click the **Upload** icon (top of the left sidebar).
- [ ] Drag your 4–5 test files onto the dropzone (or click it to browse).
- [ ] Each file shows a progress bar, then a status pill: `pending` →
      `processing` → **`ready`** (a few seconds per file — videos take
      longer than photos because of transcription).
- [ ] No file should ever show a red **`failed`** pill for the real media
      you used. If one does, open the browser console (F12 → Console tab)
      and note any red error before continuing.

### Library

- [ ] Click **Library** in the sidebar. All uploaded items appear as cards
      with a thumbnail, filename, date, duration (for videos), and tags
      (e.g. `day`, `likely outdoor`, `has-faces`).
- [ ] Use the **type** filter to show only photos, then only videos — the
      grid should update instantly.
- [ ] Use the **tag** filter to pick a tag you know one item has — only
      matching items should remain.

### Media detail

- [ ] Click your face photo. You should see the photo with a **green box
      drawn around the detected face**. If no box appears on a clear,
      frontal, well-lit face, that's a real detection miss — try a
      different, more front-on photo.
- [ ] Check the **Metadata** panel: dimensions, camera model (if your phone
      wrote it), GPS coordinates (if present), "Faces detected" count.
- [ ] Click your talking video. Press play — it should play back normally.
      Scroll down to **Transcript**: you should see your actual spoken
      words broken into timestamped lines. Click any line — the video
      should jump to that timestamp and start playing from there.
- [ ] Open the silent/no-face video (if you made one) and confirm
      "Faces detected: 0" and the transcription status reads something
      honest like `skipped` or an empty transcript — not a fabricated one.

### Map

- [ ] Click **Map**. If any uploaded photo had GPS EXIF, you should see a
      pin on the world map roughly where it was taken. Click the pin —
      a popup with the thumbnail and an "Open" button appears.
- [ ] If nothing has GPS, you should see the honest empty state message,
      not a blank/broken map.

### Search

- [ ] Click **Search**. Type a word you know is in your video's transcript
      (e.g. "testing" if that's what you said) and press Enter.
- [ ] A result card should appear with the matching snippet highlighted
      and a `transcript` tag chip plus a `@ 4.2s`-style timestamp chip.
- [ ] Try a word from a filename and a word from a tag (e.g. `outdoor`) —
      both should also return results, labeled `filename` / `tag`.

### Ask AI

- [ ] Click **Ask AI**. Click one of the three suggestion chips (or type
      your own question, e.g. "What did I talk about in my video?").
- [ ] You should get an answer labeled **`VIA MOCK`** (unless you've set an
      Anthropic API key — see Settings below) that lists the actual
      filenames/snippets it found, with clickable citation chips under the
      answer. Click a citation chip — it should jump to that media item.
- [ ] Ask something nonsensical ("find my dinosaur videos") — it should
      honestly say it found nothing, not invent an answer.

### Dashboard

- [ ] Click **Dashboard**. You should see: total media count, photo/video
      counts, faces-detected count, an "uploads over time" chart, a
      photo-vs-video pie chart, a tag-distribution bar chart, and a map
      hotspot summary — all reflecting the real numbers from what you
      uploaded.

### Settings & theme

- [ ] Click **Settings**. Confirm it shows `Provider: mock` (or
      `anthropic` if you configured a key) and the Whisper model name.
- [ ] Click **Re-index now** — it should report a count and not error.
- [ ] Click **Toggle theme** (sidebar, bottom) and confirm the whole app
      switches cleanly between dark and light with no unreadable text or
      broken layout.

### Auth / security (do this to be ready for "is it actually secure?")

- [ ] Click your avatar's **logout** icon. You should be bounced to
      `/login` and prevented from visiting `/library` etc. directly by URL.
- [ ] Register a **second** account with a different email. Upload one
      photo on this second account, then check its Library — it should
      show **only** that one new item, none of your first account's media.
      This proves the per-user data isolation.
- [ ] Log back into your first account — your original items should all
      still be there, untouched.
- [ ] (Optional, to show rate-limiting) Try logging in with a wrong
      password **6 times in a row quickly** — the first few attempts fail
      normally with "incorrect password"; after ~5 attempts within a
      minute you should get a **429 "too many requests"**-style error
      instead, proving the login endpoint is rate-limited.

If every box above is checked, the app is demo-ready.

---

## 2. Live demo script (what to actually do in front of your professor)

Keep the 4–5 test files from section 0 ready, and start from a **logged-out
state** on the login screen so the demo shows the full flow.

1. **"This is MemoryLens AI — a personal media vault I built to apply what
   I learned during my internship to a project of my own."** Show the
   login screen.
2. Register or log in live. **"Every account's data is fully isolated —
   I'll come back to that."**
3. Go to **Upload**, drop in your real photos/video. **"It's processing
   each one in the background right now — face detection, GPS/EXIF
   extraction, and for the video, speech transcription."**
4. While it's processing, open **Settings** briefly: **"Right now it's
   running fully offline — SQLite database, OpenCV for vision, a local
   Whisper model for speech-to-text, no cloud calls at all unless I
   explicitly turn on the Anthropic provider here."**
5. Back to **Library** once items are `ready`. Click into the face photo:
   **"Here's the face detection box."** Click into the video: **"Here's
   the transcript, time-synced to playback,"** click a transcript line to
   prove the seek works.
6. **Map**: show the GPS pin if you have one.
7. **Search**: search a transcript word live, point at the highlighted
   snippet and the `@ Ns` jump-to-timestamp chip.
8. **Ask AI**: ask a real question about what you just uploaded, point at
   the citation chips. **"It only ever answers from what's actually in my
   vault — if I ask it something that isn't there, it says so rather than
   making something up."**
9. **Dashboard**: let the charts speak for themselves for 10 seconds.
10. Close on the concept map: **"Everything here — the REST API design,
    OpenCV face detection, Whisper transcription, full-text search, the
    RAG pattern behind Ask AI, JWT auth and per-user data isolation — maps
    directly to a piece of the stack I worked with during the internship.
    This is the same engineering, rebuilt from scratch on a different,
    non-confidential problem."**

If asked a question you don't have a ready answer for, see the
"Anticipated professor questions" section in `PRESENTATION_GUIDE.md`.

---

## 3. If something breaks live

- **A file shows `failed`**: open it in Library anyway — the error message
  is shown in the Metadata panel (e.g. "ASR model unavailable"). This is
  actually a good save: "the pipeline fails a single step gracefully
  instead of crashing the whole upload — here's that behavior live."
- **Blank thumbnails everywhere**: you're probably logged out / token
  expired — refresh the page, it should silently refresh the session; if
  not, log in again.
- **Backend not responding**: check Terminal 1 for a Python traceback,
  Ctrl+C, and re-run `./run.sh`.
- **Port already in use**: another process is holding 8000 or 5173 — find
  and stop it (`lsof -i :8000`), or restart your Mac if unsure.
