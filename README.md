# Six Clubs Ping Pong Championship Platform

An official digital competition platform designed for the Inter-Club Table Tennis (Ping Pong) Championship between six competing clubs.

---

## Tournament Features

1. **6 Competing Clubs Authentication & Sync**:
   - Competing Clubs (T1 – T6):
     - **T1: Club 1**
     - **T2: Club 2**
     - **T3: Club 3**
     - **T4: Club 4**
     - **T5: Club 5**
     - **T6: Club 6**
   - Self-registration and login with slot assignment.
   - Dedicated Club Dashboard showing live standing rank, points, win/loss records, matches played, and match scan history.

2. **Official Conditions & Table Tennis Regulations**:
   - **Tournament Scoring System**:
     - **Victory (Win)**: **+1 Point** awarded to the winner on the live leaderboard.
     - **Defeat (Loss)**: **0 Points** awarded.
     - **No Draws**: In ping pong, every match ends in a decisive victory. There are no draws.
   - **Match Format**:
     - Single set to 11 points per match (first to reach 11 points wins).
     - Deuce rule (at 10–10, must win by a 2-point lead).
     - Service alternates every 2 points (or every 1 point after deuce). Legal 16 cm vertical palm toss.
     - No volleys; free hand table contact fault rule; edge ball rules.
   - **5-Round Rotating Schedule** (3 matches per round played sequentially on the single official table — 15 total tournament matches).
   - Dual-language support (English and Arabic).
   - Step-by-step Activity Responsible & Referee QR protocol instructions.

3. **Match QR Code Scanning**:
   - High-performance camera scanner with animated targeting reticle and instant feedback.
   - Fallback manual code entry.
   - Cryptographic verification, round validation, and duplicate claim prevention.
   - **Referee Confirmation Workflow**: Scanned match points are held as pending until confirmed by the Referee before being added to the live leaderboard.

4. **Live Leaderboard & 3-Pillar Podium**:
   - Dynamic 3-pillar Olympic/Tournament podium for Top 3 clubs.
   - Complete 6-club standings table with points, wins, matches played, and win rate.
   - Automatic live refresh every 10 seconds.

5. **Referee / Admin Portal**:
   - Permanent Standard Tournament Winner QR Code:
     - `PINGPONG-WIN-1PT` (+1 Point for winner; no draw code)
   - Custom Round & Table QR Generator for single match codes.
   - Submissions log with instant Approve, Reject, and batch "Approve All Pending" actions.
   - Manual score adjustments (bonuses and penalties).
   - 6 Clubs credentials & rename manager.
   - One-click multi-sheet **Excel (.xls)** and **CSV** database export.

---

## Quick Start (Local Run)

Requires Node.js (version 18 or newer):

```bash
# 1. Start the server
node local-server.js

# Or using npm
npm start
```

Then open your browser at:
**`http://localhost:3000`**

---

## Admin Credentials

- **Activity Responsible / Referee Token**:
  - `eco-aware can access the admin mode` (configured in `.env`)

---

## Project Structure

```
ping pong/
|-- .env                       # Tournament secrets
|-- data.json                  # Persistent JSON database (clubs, scores, match codes)
|-- export_excel.js            # Generator for Excel (.xls) and CSV tournament reports
|-- local-server.js            # Node.js server with Netlify Blobs emulation & Excel sync
|-- netlify.toml               # Netlify deployment configuration
|-- package.json               # Node.js project manifest
|-- netlify/
|   `-- functions/
|       `-- api.js             # Full serverless REST API
`-- public/
    |-- index.html             # Single-page tournament application
    |-- style.css              # Glassmorphic dark theme styling
    |-- app.js                 # Complete client-side tournament engine
    |-- pingpong_logo.svg      # Official collaboration table tennis paddles logo (vector)
    |-- pingpong_logo.png      # High-resolution transparent ping pong logo (512x512)
    |-- win_qr.svg             # Standard Match Winner (+1 pt) QR code
    |-- logo.png               # Main organizer club logo
    `-- vendor/
        |-- jsQR.js            # Client-side QR scanner library
        `-- qrcode.js          # QR code SVG/Canvas generator library
```

---

## Deployment to Netlify

This project is pre-configured for one-click deployment on Netlify:

1. Push this repository to GitHub.
2. Sign in to [Netlify](https://app.netlify.com/) and click **"Add new site" -> "Import an existing project"**.
3. Select your GitHub repository.
4. Netlify will automatically detect settings from `netlify.toml` (`publish = "public"`, `functions = "netlify/functions"`).
5. Add your environment variables in Netlify Site Settings:
   - `QR_SECRET`: A secret string for QR code signing
   - `ADMIN_TOKEN`: Your referee admin passphrase
6. Click **Deploy**!
