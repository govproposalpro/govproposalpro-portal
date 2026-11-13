# GovProposalPro iPhone app

The iPhone app is a native shell built with [Capacitor](https://capacitorjs.com). It opens the live Command Center at `https://govproposalpro.com/app`, so every website release reaches phones right away. You only need a new app build when something in this folder changes, such as the icon, a permission or a native feature.

The native parts:

| Feature | Where it lives |
| --- | --- |
| Push notifications (deadline reminders, "your proposal is ready", "solicitation decrypted") | `ios/App/App/AppDelegate.swift`, `src/services/apns.js`, `src/app/routes/devices.js` |
| Print and Save as PDF from the iOS print sheet (`window.print()` does nothing in an iOS web view) | `ios/App/App/GPPNative.swift`, `frontend/app/tools/05-native.js` |
| Word and CSV downloads go to the iOS share sheet (Save to Files, Mail, AirDrop) | `frontend/app/tools/05-native.js` |
| Pull down to refresh, dark launch screen, app icon, camera and photo uploads | `ios/App/App/GPPNative.swift`, `scripts/make-icons.py`, `ios/App/App/Info.plist` |
| An offline screen with a "Try again" button | `www/offline.html` |
| No prices, checkout or upgrade buttons anywhere in the app | `frontend/app/tools/05-native.js`, `src/app/routes/auth.js` (`/api/me` sends no upgrade link to the app) |

**Apple's purchase rule.** Members buy on the website (Whop) and then sign in on the app. The app must not show prices, link to Whop, or tell people where to buy (App Store Review Guideline 3.1.3(f)). The web app checks for `window.Capacitor` and hides all of that, and the server leaves out the upgrade link when the user agent contains `GovProposalProApp/`.

## One-time setup (owner)

Builds run on GitHub's Mac servers, so you don't need Xcode or a paid build service. The only cost is Apple's.

### 1. Join the Apple Developer Program ($99 a year)

Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll). If you enroll as an organization (Valor Innovation Management & Consulting), the company name shows on the app; that needs a free D-U-N-S number. Apple usually approves within 1 to 2 days.

### 2. Register the app ID

1. Go to [Identifiers](https://developer.apple.com/account/resources/identifiers/add/bundleId), choose **App IDs**, then **App**.
2. Description: `GovProposalPro`. Bundle ID: **Explicit**, `com.govproposalpro.app`.
3. Under Capabilities, tick **Push Notifications**. Then click Continue and Register.

### 3. Create the app in App Store Connect

In [App Store Connect](https://appstoreconnect.apple.com/apps), click **+** and then **New App**:

- Platform: iOS
- Name: GovProposalPro
- Primary language: English (U.S.)
- Bundle ID: `com.govproposalpro.app`
- SKU: `govproposalpro-ios`
- User access: Full Access

### 4. Create an App Store Connect API key (lets GitHub sign and upload builds)

1. In App Store Connect, go to **Users and Access**, then **Integrations**, then **App Store Connect API**. Open **Team Keys** and click **+**.
2. Name it `GitHub builds` and give it **Admin** access. Admin is needed to create the signing certificate.
3. Download the `.p8` file. Apple lets you download it only once.
4. Write down the **Key ID** and the **Issuer ID**, which is shown above the list.

### 5. Make a signing key on your Mac

Open Terminal and run:

```
openssl genrsa 2048 | pbcopy
```

This copies a new private key to your clipboard. Paste it straight into the GitHub secret in the next step, then copy something else so it doesn't stay on the clipboard. The build uses it to create and reuse the app's distribution certificate.

### 6. Add four GitHub secrets

Go to [the repo's Actions secrets](https://github.com/govproposalpro/govproposalpro-portal/settings/secrets/actions) and click **New repository secret** for each one:

| Name | Value |
| --- | --- |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID from step 4 |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | Key ID from step 4 |
| `APP_STORE_CONNECT_PRIVATE_KEY` | The whole `.p8` file from step 4. Open it in TextEdit and copy everything, including the BEGIN and END lines. |
| `IOS_CERTIFICATE_PRIVATE_KEY` | The key from step 5 |

Never paste these anywhere else.

### 7. Set up TestFlight for outside testers

In App Store Connect, open the app and go to **TestFlight**.

1. Under **Test Information**, fill in:
   - Beta App Description
   - Feedback email: `contact@govproposalpro.com`
   - Privacy Policy URL: `https://govproposalpro.com/privacy`
   - Beta App Review contact details
   - A sign-in for Apple's reviewer. Use a dedicated demo member account, not a real member's.
2. Under **External Testing**, click **+**, name the group `Members`, then turn on **Public Link**.
3. Optional: so each build joins that group automatically, add a repository **variable** (not a secret) on [the variables page](https://github.com/govproposalpro/govproposalpro-portal/settings/variables/actions) named `TESTFLIGHT_GROUP` with the value `Members`.

### 8. Build and upload

1. Go to **Actions**, then **iPhone app**, then **Run workflow**.
2. The build takes about 15 to 20 minutes. It ends up in App Store Connect under TestFlight.
3. The first build goes through Apple's beta review, which usually takes less than a day. Builds after that are often approved automatically.
4. Share the public link with members. They install **TestFlight** from the App Store, open the link and tap **Install**.

TestFlight builds expire after 90 days, so run the workflow again every couple of months, or when this folder changes.

### 9. Turn on push notifications (server)

1. Go to [developer.apple.com Keys](https://developer.apple.com/account/resources/authkeys/list) and click **+**.
2. Name it `GovProposalPro push` and tick **Apple Push Notifications service (APNs)**. Click Configure and choose **Sandbox & Production**.
3. Download the `.p8` file and note its Key ID.
4. In the [Render environment](https://dashboard.render.com/web/srv-db5spqivcj2c73959ahg/env), add:

| Key | Value |
| --- | --- |
| `APNS_KEY` | The whole `.p8` file text |
| `APNS_KEY_ID` | That key's Key ID |
| `APNS_TEAM_ID` | Your Team ID (shown on [Membership details](https://developer.apple.com/account#MembershipDetailsCard)) |

Until these are set, the app works normally and simply sends no notifications.

## Developer notes

- `npm ci && npx cap sync ios` from `mobile/` installs the plugins and copies `www/` and the config into the Xcode project. With a Mac and Xcode installed, `npx cap open ios` opens it.
- `capacitor.config.json`:
  - `server.url` is the live site.
  - `server.errorPath` is the offline page.
  - `ios.appendUserAgent` is what the server checks to recognize the app.
- `python3 scripts/make-icons.py` redraws the icon and launch screen from `assets/mark.png`.
- Pull requests that touch `mobile/` run an unsigned simulator build to check that the app compiles. Builds on private repos use GitHub Actions minutes, and macOS minutes count 10 times. The free plan's 2,000 minutes cover roughly 10 builds a month.
- For a debug build from Xcode, set `APNS_ENV=sandbox` on a test server, because debug builds get sandbox push tokens. TestFlight and App Store builds use production, which is the default.
