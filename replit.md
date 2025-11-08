# LinkedIn Auto Apply Chrome Extension

## Project Overview
This is a Chrome browser extension that automates job applications on LinkedIn using the Easy Apply feature. The extension runs in the browser and helps users automatically fill out and submit job applications.

## Project Type
Browser Extension (Chrome Manifest V3)

## Architecture
- **manifest.json**: Chrome extension configuration
- **popup.html/popup.js/popup.css**: Side panel UI for user controls and settings
- **content.js**: Content script that runs on LinkedIn job pages to automate applications
- **background.js**: Service worker for extension lifecycle management
- **Icons**: Extension icons (16px, 48px, 128px)

## Key Features
- Automatic job application submission via LinkedIn Easy Apply
- Form auto-fill with user profile data
- Smart job processing (skips already applied, non-Easy Apply jobs)
- Manual pause for complex forms
- Application tracking (applied/skipped counts)
- Per-job timeout handling
- Pagination support across job search pages

## Installation Instructions

### For Chrome Browser:
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the project folder
5. The extension will appear in your extensions list

### Usage:
1. Configure your profile in the extension popup
2. Navigate to LinkedIn job search
3. Click "Start Auto Apply"
4. Keep the side panel open while browsing

## Development Notes
- This is a client-side browser extension that cannot run as a web server
- No backend or database required
- All data stored locally in Chrome storage
- Requires Chrome browser to load and test

## How to Use This Extension

### In Replit:
This project serves a documentation page at the preview URL that explains how to install the extension.

### To Install in Chrome:
1. Download or clone this repository to your local machine
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked" and select this folder
5. The extension will appear in your Chrome toolbar

### Configuration:
1. Click the extension icon in Chrome
2. Fill in your profile (name, email, phone, skills)
3. Save your profile
4. Navigate to linkedin.com/jobs
5. Start the auto-apply process

## Files Structure
- `manifest.json` - Extension configuration (Manifest V3)
- `popup.html/js/css` - Side panel UI and controls
- `content.js` - Main automation script (runs on LinkedIn pages)
- `background.js` - Service worker for extension lifecycle
- `icon*.png` - Extension icons (16, 48, 128px)
- `index.html` - Documentation page (served on Replit)
- `README.md` - Detailed usage instructions

## Recent Changes
- **2025-11-08**: Initial import from GitHub and Replit setup complete
- Created documentation server to display installation instructions
- Validated all extension files (manifest.json, JS files, icons)
- Project ready for Chrome installation
