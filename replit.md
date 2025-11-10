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
- `extension/` - Chrome extension folder (load this in Chrome)
  - `manifest.json` - Extension configuration (Manifest V3)
  - `popup.html/js/css` - Side panel UI and controls
  - `content.js` - Main automation script (runs on LinkedIn pages)
  - `background.js` - Service worker for extension lifecycle
  - `icon*.png` - Extension icons (16, 48, 128px)
- `index.html` - Documentation page (served on Replit)
- `README.md` - Detailed usage instructions

## Replit Environment Setup
- **Documentation Server**: Node.js HTTP server running on port 5000
- **Server File**: `server.js` - serves the documentation page and extension files
- **Workflow**: `documentation-server` - runs `npm start`
- **Deployment**: Configured for autoscale deployment
- **Purpose**: Provides a web-based documentation page explaining how to install the Chrome extension

## Recent Changes
- **2025-11-10**: Foolproof Status Detection & First Job Fix
  - **DETECTION FIX: Easy Apply button**: Now prioritizes #jobs-apply-button element with span content validation for most reliable detection
  - **DETECTION FIX: Success verification**: Uses #jobs-apply-see-application-link as primary indicator of successful application
  - **DETECTION FIX: Already applied check**: Checks #jobs-apply-see-application-link first for definitive proof
  - **LOGIC: Easy Apply → Already Applied**: Tracks job state transition as definitive success proof
  - **BUG FIX: First job filtering**: Fixed overly aggressive filtering that was skipping valid jobs
  - **LOGGING: Enhanced debugging**: Added detailed logging showing which jobs are filtered and why
  - **LOGGING: First jobs display**: Shows first 3 jobs in queue with titles/companies for verification

- **2025-11-10**: Critical Bug Fixes & UI Improvements
  - **BUG FIX: Starting from 1st card**: Fixed index increment logic - now only advances after confirming valid jobId, ensuring automation always starts from the first job
  - **BUG FIX: Easy Apply detection**: Strengthened button detection with strict "Easy Apply" text/aria validation - prevents false positives on regular Apply buttons
  - **BUG FIX: Wrong job application**: Enhanced job verification to detect and abort when wrong job is loaded - prevents applying to incorrect jobs
  - **UI: Skills marked as experimental**: Skills section now clearly labeled as experimental feature and not required
  - **UI: Refresh documentation note**: Added reminder to refresh page after updates
  - **OPTIMIZATION: History tab loading**: History only loads when History tab is clicked, improving performance
  
- **2025-11-10**: Job History & Robustness Update
  - **JOB HISTORY**: Added complete job history tracking with searchable table
    - Captures job title, company, link, and status for every processed job
    - New History tab in popup with filterable table (search by job/company, filter by status)
    - Export history to CSV for external analysis
    - Clear history option with confirmation
    - Stores up to 500 most recent jobs to prevent storage bloat
  - **ROBUSTNESS**: Critical error handling improvements
    - All history saves wrapped in try/catch to prevent automation crashes
    - History tracking never blocks job processing
    - Graceful degradation if storage fails
  - **TIMING FIX**: Consistent 10-second wait between ALL jobs (applied/skipped/failed/stopped)
    - Every job pathway now uses the same 10-second countdown
    - User can skip wait with "Skip waiting" button
    - Prevents LinkedIn rate limiting by spacing out all requests equally
  - **STATUS FIX**: Improved apply status accuracy
    - Less strict verification - assumes "applied" when modal closes successfully
    - Better detection of already-applied jobs
  - **START FIX**: Clear logging confirms starting from first job card (index 0)
  - **UI/UX**: Tabbed interface in popup (Profile tab + History tab)
  
- **2025-11-10**: Critical bug fixes and feature improvements
  - **CRITICAL FIX**: Fixed "wrong job application" bug - extension now verifies correct job loaded before applying
  - Added `waitForCorrectJobToLoad()` function with 4 verification methods (URN, links, URL, DOM attributes)
  - Fixed sequential processing to always start from job 1 (was starting at random position)
  - Fixed resume/pause functionality - resume button now properly resumes auto-apply
  - Added message handlers for manualResume, skipJob, pauseAutoApply actions
  - Added LinkedIn validation error detection - auto-pauses when validation errors appear after clicking Next
  - Timer now displays remaining time in countdown ring during pause state (shows "M:SS" + "paused" label)
  - Set per-job timeout to 60 seconds (reasonable for application flow)
  - Added MANUAL_REVIEW_SECONDS constant (300s for manual form completion)
- **2025-11-10**: Replit environment setup
  - Created Node.js HTTP server to serve documentation page
  - Configured workflow to run on port 5000
  - Set up deployment configuration for autoscale
  - Server serves index.html and extension files with proper MIME types
  - Cache control headers added to prevent stale content
- **2025-11-08**: Major updates and fixes
  - Fixed "no easy apply jobs found" issue - now processes ALL jobs sequentially
  - Removed pre-counting, checks Easy Apply availability per job dynamically
  - Added visual features: job card highlighting, status badges, per-job timers
  - Per-job timers show elapsed time (counting UP) with ⏱️ indicator
  - Progress display shows "Job X/Y (Z%) | ✅ N Easy Apply"
  - All timers stop properly when user clicks stop
  - Improved form filling: better detection of name, phone, email, skills, yes/no, experience fields
  - Fixed circular timer warning in popup when paused
  - Moved all extension files to `extension/` folder for better organization
  - Sequential processing: properly skips invalid jobs and continues to next
