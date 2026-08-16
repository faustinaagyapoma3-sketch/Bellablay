# BellaBlay Market — Standalone GitHub Pages Package

This folder is a standalone website. It has no build step, no Node installation, and no framework dependency.

## Deploy on GitHub Pages

1. Create a new GitHub repository, for example `bellablay-market`.
2. Upload every file in this folder to the repository root: `index.html`, `styles.css`, `app.js`, and this README.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder, then click **Save**.
6. GitHub will provide the live website address after deployment finishes.

## What Works in This Static Demo

The browser demo includes account creation, a newest-first marketplace feed, a posting form, a three-photo limit, a one-video limit, listing detail, comments/reviews, and owner moderation controls. New listings, comments, and demo accounts are stored in the current browser using local storage.

## Important Production Limitation

GitHub Pages serves static files only. It cannot securely provide shared user accounts, a common live feed for all users, permanent media uploads, protected owner moderation, or Paystack secret-key verification by itself. To make the marketplace real for everyone, connect the same HTML front-end to a service such as Supabase for authentication, database records, and media storage, plus a server-side function for Paystack verification.

Never paste Paystack secret keys into `app.js` or any file committed to GitHub.
