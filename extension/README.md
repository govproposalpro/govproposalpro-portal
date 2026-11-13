# GovProposalPro for SAM.gov (browser extension)

Adds a **Send to GovProposalPro** button to every SAM.gov opportunity page. The button opens
`/app/import?notice=<id>` in GovProposalPro, where the member can add the bid to their CRM, run
Competition X-Ray, decrypt it or draft a sources-sought response.

- Manifest V3, no permissions, no data collection: it only reads the notice id from the address bar.
- Works in Chrome, Edge, Brave and other Chromium browsers.

## Install without the store (free)
1. Download `govproposalpro-sam-extension.zip` from the member app (`/app/import`) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder.

## Publish to the Chrome Web Store
A Chrome Web Store developer account costs a one-time $5. Upload the same zip, add the
screenshots and the privacy answers ("does not collect user data"), then submit for review.

## Rebuild the zip
`npm run build:extension` writes `public/assets/extension/govproposalpro-sam-extension.zip`.
