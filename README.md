# MARDUK — Build Instructions

## What you need
- Node.js (download from https://nodejs.org — use the LTS version)
- Google Drive for Desktop installed and signed in on your PC

## Steps

### 1. Put all files in a folder
Create a folder called `marduk-app` anywhere on your PC and put these files inside:
- main.js
- preload.js
- index.html
- package.json
- icon.png (optional — add a .png image for the app icon)

### 2. Open terminal in that folder
Right-click inside the folder → "Open in Terminal" (or PowerShell)

### 3. Install dependencies (only needed once)
```
npm install
```
This downloads Electron (~200MB). Takes 1-2 minutes.

### 4. Test it first (optional)
```
npm start
```
This launches the app directly so you can verify everything works before building.

### 5. Build the .exe
```
npm run build
```
This creates a `dist` folder. Inside you'll find `MARDUK.exe`.

## The .exe file
- `MARDUK.exe` is a **portable app** — no installation needed
- Copy it to any PC, double-click and it runs
- Your data is saved to your **Google Drive folder** as `marduk-data.json`
- Your password is saved **locally only** (never synced) for security

## Syncing between PCs
1. Make sure Google Drive for Desktop is installed and running on both PCs
2. Both PCs will automatically share the same `marduk-data.json`
3. Your password is set independently on each PC (by design — more secure)

## Where is my data?
The app saves data to:
`[Your Google Drive folder]\marduk-data.json`

Common locations:
- `C:\Users\[you]\Google Drive\marduk-data.json`
- `G:\My Drive\marduk-data.json`

## Troubleshooting
- If the app can't find your Google Drive folder, data will be saved to:
  `C:\Users\[you]\AppData\Roaming\marduk\marduk-data.json`
  In that case, manually move it to your Google Drive folder.
