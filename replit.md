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

## Recent Changes
- **2025-01-08**: Initial import from GitHub
- Project structure documented for Replit environment
