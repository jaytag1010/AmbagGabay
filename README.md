# AmbagGabay

AmbagGabay organizes shared-expense folders, friends, reusable groups, contributions, item-level participants, and balances. Built with Next.js, TypeScript, Tailwind CSS, Firebase Authentication, Cloud Firestore, and Firebase Storage.

## Requirements

- Node.js 20 or newer
- A Firebase project with a Web App
- Cloud Firestore
- Email/Password authentication enabled
- Google authentication enabled for Google sign-in
- Firebase Storage enabled for profile pictures

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Copy the Firebase Web App configuration values from Firebase Console → Project settings → Your apps into `.env.local`. Missing configuration is shown as a useful sign-in screen error and does not prevent a production build.

No collections need to be created manually. The app creates each user profile and stable `friends/me` record on first sign-in, then creates subcollections when records are saved.

## Firebase CLI

Install or run the Firebase CLI, then select your project and deploy the rules:

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules,storage
```

`firebase.json`, production-oriented owner-only `firestore.rules`, and `storage.rules` are included.

## Checks

```bash
npm run lint
npm run build
```

## Deploy to Vercel

Import the Git repository into Vercel. Add every variable from `.env.example` under Project → Settings → Environment Variables for Preview and Production, then deploy. No custom hosting configuration is required; future pushes normally trigger deployments once GitHub is connected.

## Data model

Private data lives below `users/{uid}`. Friends, friend groups, folders, future nested contributions/expenses, and settlements are isolated by Firestore rules. Expense amount and participant IDs remain the future source of truth; calculated shares are intentionally not stored in Version 0.1.

## Manual Steps Remaining

1. Create or select a Firebase project and register a Web App.
2. Enable Email/Password and Google providers in Firebase Authentication.
3. Create Cloud Firestore in Production mode.
4. Copy `.env.example` to `.env.local` and paste the Firebase Web App values.
5. Authenticate/select the project with Firebase CLI and deploy `firestore.rules`.
6. Create/connect a GitHub repository and import it into Vercel.
7. Add the same Firebase environment variables in Vercel.
