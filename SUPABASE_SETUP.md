# Activate BellaBlay Market

The static website files are ready to use the Supabase project at `awonqlpigyujjhezmcho`. Complete the following one-time setup before uploading the updated files to GitHub Pages.

## 1. Create the database and security rules

Open your Supabase project dashboard. Select **SQL Editor**, create a new query, then copy and run the complete contents of `supabase-schema.sql`. This creates the account profiles, listings, media records, public comments, buyer enquiries, private messages, storage bucket, indexes, and row-level security rules.

> The SQL automatically grants owner moderation access only to `Faustinaagyapoma3@gmail.com` when that email creates its BellaBlay account.

## 2. Configure sign-in

Under **Authentication → Providers → Email**, ensure email and password sign-in is enabled. Under **Authentication → URL Configuration**, add your future GitHub Pages address, for example `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/`, as a redirect URL. Keep email confirmation enabled if you want each user to verify their address before signing in.

## 3. Create the owner account

After running the SQL, open the published BellaBlay website and create an account using `Faustinaagyapoma3@gmail.com`. This account automatically receives the owner moderation role. You can then use **My account** to see your listings and buyer conversations, and **Owner moderation** to hide, approve, or remove public listings.

## 4. Publish the updated static files

Upload the complete contents of this folder to the root of your GitHub repository, including `supabase-config.js`, `app.js`, `auth.css`, and the existing `index.html` and `styles.css` files. In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

## Important security rule

`supabase-config.js` contains the Supabase **publishable** key, which is designed to be used by browser applications. Do not add a Supabase `service_role` key or any Paystack secret key to GitHub, JavaScript, or the public website. The supplied SQL uses row-level security so users can see only the listings, enquiries, and conversations they are allowed to access.
