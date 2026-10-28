# Aapka Dentist

A responsive patient website with a separate receptionist management dashboard. This project stays dependency-free and uses only Node.js built-ins and browser features. It does not call a hosted AI, email, or database service.

## Project structure and shared records

- `server.mjs` is the Node.js HTTP backend and API.
- `server/auth.mjs` provides password hashing and signed-in staff sessions using Node.js built-ins.
- `scripts/create-receptionist.mjs` creates a password hash for the first receptionist account.
- `public/` contains the patient website and the separate receptionist dashboard.
- `data/store.json` is the single local data file used by both websites. A patient booking and a receptionist change appear in the same records.

There is no React or Express framework, and no SQL database or migration system in the existing project. The shared JSON file is suitable for a single-process demo only; it is not safe for real clinic operations or multiple server instances.

## Run locally

Prerequisite: Node.js 18 or newer. No package download is needed.

1. In this folder, copy `.env.example` to a new file named `.env`.
2. Open a terminal in this folder and run `npm run create:receptionist`. Enter the email and password you want for the receptionist account. The password is hidden while you type. The command prints a password hash, not the password itself.
3. Put the printed `RECEPTIONIST_EMAIL` and `RECEPTIONIST_PASSWORD_HASH` lines into `.env`, replacing the example values. Do not share or commit `.env`.
4. Run `npm start`.
5. Open the patient website at http://localhost:4173 and the staff dashboard at http://localhost:4173/receptionist.

## Dashboard features

- Staff sign-in, sign-out, eight-hour server-side sessions, HttpOnly cookies, password hashing with scrypt, and a five-attempt/15-minute login limit.
- Overview counts and today's/next appointments, calculated with `CLINIC_TIMEZONE`.
- Search, filters, status filters, date filters, and 15-row pagination.
- Day, week, and month calendar views.
- Appointment details, rescheduling with server-side availability rechecks, cancellation, and marking past confirmed appointments completed.
- Receptionist-created bookings use the same patient and appointment records as website bookings. Email is optional if a phone number is provided.
- Patient contact list and appointment history.
- Automatic dashboard polling every 15 seconds; no browser refresh is needed.
- Changes appear in the same shared store used by patient booking and cancellation.

Status values reuse `confirmed` and `cancelled`; `completed` is added for attended appointments. The current patient booking flow confirms bookings immediately, so a pending-confirmation count is shown but is normally zero. Dentist assignment is not available in the current data model. The dashboard identifies website/receptionist source where recorded; older entries may show “Not recorded.”

## Environment settings

`PORT`, `CLINIC_NAME`, `CLINIC_TIMEZONE`, `CLINIC_EMAIL`, `CLINIC_PHONE`, and `CLINIC_ADDRESS` configure the server and clinic. `RECEPTIONIST_EMAIL` and `RECEPTIONIST_PASSWORD_HASH` configure the initial staff account. `DATA_FILE` can select a data file path when the hosting service provides persistent storage.

On Render, add the staff email and generated password hash as private environment settings. Set `NODE_ENV=production` so the session cookie is marked Secure. Never put real credentials in GitHub. The `.gitignore` file excludes `.env` and the local data file.

## API added

- `POST /api/receptionist/login`
- `GET /api/receptionist/me`
- `POST /api/receptionist/logout`
- `GET /api/receptionist/appointments`
- `GET /api/receptionist/availability`
- `POST /api/receptionist/appointments`
- `PATCH /api/receptionist/appointments/:reference` for confirm, reschedule, cancel, or complete
- `GET /api/receptionist/patients`
- `GET /api/receptionist/activity`

All receptionist data and write routes require an authenticated receptionist session. The older `/api/admin` routes are also protected by this session.

## Email and deployment limits

The existing app has no real email provider. The dashboard records email attempts as simulated and labels them as not sent. Email errors do not undo appointment changes.

For a Render demonstration, use fictional patient information. The local JSON file may be cleared when a free service sleeps or restarts. Durable live appointments require a persistent approved database or storage, atomic conflict handling across instances, privacy review, and clinic authorization. This demo does not claim production-grade patient security.

## Checks performed

Syntax-check files with `node --check server.mjs`, `node --check server/auth.mjs`, `node --check scripts/create-receptionist.mjs`, `node --check public/app.js`, and `node --check public/receptionist.js`. End-to-end API workflows should be tested against a temporary `DATA_FILE` so existing records are not changed.
