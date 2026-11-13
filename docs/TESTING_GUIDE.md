# MemoryLens AI — Testing Guide

A click-by-click script for testing the app yourself and then demoing it
live to your professor. Pairs with `docs/PRESENTATION_GUIDE.md` (the talking
points) — this doc is just "what to click, in what order, what you should see."

Budget ~10–12 minutes for the full run-through.

---

## 0. Before you start

### Option A — Docker (recommended, one command)

```bash
docker compose up --build
```

This builds and runs both the backend and the frontend (served by nginx)
exactly as they'll run anywhere — no Python venv, no Node version issues.
Open **http://localhost:5173**. Your data lives in `backend/data/` on your
own machine and survives restarts/rebuilds.

### Option B — run the two dev servers directly (two terminals)

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

**The very first account ever created on a fresh install automatically
becomes the admin account** (you'll see an "Admin" link in the sidebar).
Every account after that is a regular member. If you want a second,
non-admin account to demo data isolation, just register again with a
different email afterward.

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
- [ ] Click the star icon on a card to favorite it, then click the
      **Favorites** button — only favorited items should remain; click it
      again to show everything.
- [ ] Click **Select**, tick 2 cards, confirm the toolbar shows
      "2 selected", then click **Delete selected** and confirm the dialog —
      both items should disappear. (Only test this on throwaway items —
      it's permanent, same as a single delete.)

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
- [ ] Known limitation, not a bug: in offline/mock mode Ask AI is backed
      by literal keyword search, not true language understanding — a
      paraphrase like "any videos with people talking?" can come back
      empty even when a matching video exists, because none of those exact
      words appear in your tags/transcript. Prefer words you know are
      actually in your transcript or tags when demoing this live, or
      mention it as an honest, disclosed limitation if asked.

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

### Command palette

- [ ] Press **Cmd/Ctrl+K** from anywhere in the app. A quick-navigation
      palette should pop up — type a page name (e.g. "dashboard") and
      press Enter to jump there, or type free text and it routes to Search.

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

### Email OTP login, verification & password reset

- [ ] Go to **Settings → Security** and click **Enable** next to "Require
      a login code (OTP)". Log out, then log back in with the correct
      password — instead of landing in the app, you should see an
      "Enter your code" screen. Since no real email server is configured
      by default, the actual 6-digit code is printed to the **backend
      terminal**, prefixed `[DEV MODE — email not sent, SMTP not
      configured]` — copy it from there. Enter a wrong code first (should
      cleanly say "Invalid or expired code"), then the real one (should
      log you in). The "Resend code" link has a 30-second cooldown.
- [ ] Notice the **"Please verify your email address"** banner at the top
      of the app. Click **Resend verification email**, check the backend
      terminal for the new code, then (from Settings) confirm verifying
      clears the banner.
- [ ] Log out, click **Forgot password?**, enter your email, submit — you
      get a generic "if that email exists" message either way (this is
      intentional: it never reveals whether an account exists). Grab the
      reset code from the backend terminal, enter it with a new password,
      and confirm you can log in with the new password (and not the old one).
- [ ] If you want this to actually send real email instead of printing to
      the terminal: set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/etc. in
      `backend/.env` (see `backend/.env.example` for a Gmail App Password
      walkthrough), then restart the backend. Not required for the demo.

### Admin panel (RBAC)

- [ ] As your first (admin) account, open the **Admin** link in the
      sidebar — only admins see this link; a non-admin account visiting
      `/admin` directly gets redirected away.
- [ ] Confirm the user table lists every account with role/status badges
      and a media count, and the stat tiles (total users/media/admins)
      match reality.
- [ ] Click **Deactivate** on a non-admin test account, confirm the dialog,
      and confirm that account can no longer log in (clean rejection, not
      a crash) until you **Reactivate** it.
- [ ] Try **Promote**/**Demote** on another account. Note you can't
      deactivate or demote *yourself*, and the last remaining admin can't
      be demoted — both are deliberate safety guards worth mentioning if asked.

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
10. **Settings → Security**: toggle on the login code requirement, log out
    and back in to show the OTP screen live (code comes from the backend
    terminal in dev mode — point that out as intentional, not a bug).
11. **Admin**: "Since I'm the first account ever created, I'm the admin —
    here's a basic RBAC panel: user list, deactivate/reactivate, promote
    and demote, with guardrails so you can't lock yourself out."
12. Close on the concept map: **"Everything here — the REST API design,
    OpenCV face detection, Whisper transcription, full-text search, the
    RAG pattern behind Ask AI, JWT auth, email-based OTP, and role-based
    access control — maps directly to a piece of the stack I worked with
    during the internship. This is the same engineering, rebuilt from
    scratch on a different, non-confidential problem."**

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

---

## 4. Accuracy verification — exact data, exact expected results

This is the test matrix actually run against this app, with real photos
and a real recording, including two deliberately hard cases. Use this to
verify accuracy yourself, or to show your professor "here's proof, not a
claim."

### 4.1 Upload this exact set (recommended)

| File | Where to get it | What it tests |
|---|---|---|
| A clear, front-on, well-lit **portrait photo** of one person | A selfie, or any single-subject photo | Face detection on an easy case — should find exactly 1 face. |
| 2–3 **outdoor photos in daylight** | Your Photos app | GPS/EXIF extraction, `likely outdoor` / `day` tags, Map pins. |
| 1 **indoor or night photo** | Your Photos app | `evening/indoor` tag, contrast with the outdoor tags above. |
| A **group/crowd photo taken from far away** (e.g. a wide shot at an event) | Any crowd photo where faces are small in the frame | **Deliberately hard case** — see 4.3 below. |
| A **10–30s video of yourself talking** | Camera app | Real transcription (not a canned response) + per-keyframe face boxes. |

### 4.2 Accuracy checklist (easy cases — expect these to be exactly right)

- [ ] Portrait photo → **Faces detected: 1**, and the green box drawn on
      the Media Detail page sits squarely on the actual face, not
      elsewhere in the frame.
- [ ] Outdoor daylight photos → tag includes `day` and `likely outdoor`;
      **Faces detected: 0** if no one's in the shot (the app must never
      invent a face that isn't there).
- [ ] Each GPS-tagged photo → a pin on the **Map** page landing at
      roughly the real location (zoom in and compare to where you
      actually took it).
- [ ] The talking video → **Transcript** panel shows your actual words
      (not generic filler), broken into timestamped lines that each jump
      the video to the right moment when clicked.
- [ ] Re-upload the exact same video a second time → the transcript and
      face count should come out identical both times — a correct ASR/CV
      pipeline is deterministic on the same input.

### 4.3 Deliberately hard cases (expect an *honest* answer, not a perfect one)

These exist to prove the app never fakes a result — point them out to
your professor as evidence of honesty, not failure:

- [ ] **Wide/aerial crowd photo** (faces smaller than roughly 40×40
      pixels at the app's working resolution) → **Faces detected: 0**.
      This is correct, expected behavior for the classical face detector
      used here (OpenCV Haar cascade, not a deep model) — it's honest
      about its limits rather than guessing. Tested live with a real
      40-person aerial photo: 0 faces, no crash, no false claim.
- [ ] **A photo with no people at all** (a landscape, a building, a
      night skyline) → **Faces detected: 0**, tags like `likely outdoor`
      still populate normally. Tested with 4 real landscape/architecture
      photos: all correctly 0.
- [ ] **A silent video, or one with background noise instead of clear
      speech** → Transcription status should read `skipped` or produce
      an empty transcript — never a fabricated transcript.
- [ ] **Ask AI, asked a paraphrase that doesn't match your actual
      tags/transcript** (e.g. "any videos with people talking?" when your
      video's transcript never uses those exact words) → may come back
      empty in offline/mock mode. This is a known, disclosed limitation —
      the mock provider does literal keyword search, not language
      understanding. Rephrase using words you know are in your data
      (e.g. "capstone", or whatever you actually said), or switch
      `LLM_PROVIDER=anthropic` with a real API key for true language
      understanding.
- [ ] **Multiple uploads at once** (select 5+ files together) → the
      server must stay up and every item must still reach `ready` or
      `failed` — never crash the whole app. (This was a real bug, found
      and fixed: uploading many files simultaneously used to segfault
      the backend. Confirmed fixed with repeated real-data tests.)

### 4.4 Exact Ask AI prompts to try

| Prompt | What should happen |
|---|---|
| "What's in my videos?" | Cites your actual video filename(s) and a transcript snippet. |
| A word you know is in your transcript (e.g. part of what you said) | Finds the video, with the exact timestamp of that line. |
| "Show me outdoor photos" | Cites the photos tagged `likely outdoor`. |
| Something nonsensical, e.g. "find my pet dinosaur" | Honestly says it found nothing — never invents an answer. |

### 4.5 Security / robustness checklist

- [ ] Try registering with the same email twice → clean rejection, not a
      crash.
- [ ] Try a password under 8 characters, or one without a number →
      rejected with a clear message.
- [ ] Try uploading a `.exe` file, or a `.txt` file renamed to `.jpg` →
      both cleanly rejected (the second one by checking real file
      content, not just the extension).
- [ ] Try 6 rapid-fire wrong-password login attempts → the first few fail
      normally, then you get a clear "too many requests" instead — proves
      the login endpoint is rate-limited against brute-forcing.
- [ ] As a non-admin account, try visiting `/admin` directly by URL →
      redirected away, not shown the page.

If every box in sections 4.2–4.5 checks out, the app's accuracy and
robustness are verified, not just claimed.
