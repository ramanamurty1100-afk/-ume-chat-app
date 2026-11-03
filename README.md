# U&Me — full-stack starter

A web-first, Android-packaging-ready real-time chat starter.

## Included
- React + Vite responsive client
- Express API + Socket.IO realtime transport
- Prisma schema for PostgreSQL (users, conversations, memberships, messages)
- JWT authentication starter
- Capacitor Android configuration

## Requirements
Node.js 20+, PostgreSQL, Android Studio (only for APK builds).

## Run locally
1. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` and `JWT_SECRET`.
2. Install dependencies: `cd server && npm install`, then `cd ../client && npm install`.
3. Create tables: `cd server && npx prisma generate && npx prisma db push`.
4. Start backend: `cd server && npm run dev`.
5. Start web client: `cd client && npm run dev`.

The client expects the API at `http://localhost:4000`. For deployment set `VITE_API_URL`.

## Android
From `client`: install dependencies, run `npm run build`, then `npx cap add android` (first time), `npx cap sync android`, and open the `android` folder in Android Studio. Use Build > Generate Signed Bundle / APK. A signing key is required for a distributable signed APK.

## Production work still required
Before public launch, add email/phone verification, password reset, rate limiting, refresh-token rotation, secure object storage for uploads, malware/type/size checks, TURN servers for reliable WebRTC calling, push notification credentials, privacy/retention controls, moderation/report workflows, backups, monitoring, and a security review. This is a foundation, not a production-certified WhatsApp replacement.