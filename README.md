# LinkedIn Auto Apply Chrome Extension

A Chrome extension that automatically applies to LinkedIn jobs using the Easy Apply feature.

## Features

- **Automatic Job Applications**: Automatically clicks Easy Apply buttons on LinkedIn job listings
- **Form Auto-Fill**: Fills in phone number, email, and other common fields
- **Smart Processing**: Skips jobs already applied to or without Easy Apply option
- **Simple Controls**: Easy start/stop controls via extension popup
- **Application Tracking**: Keeps track of applied and skipped jobs

## Installation

### Step 1: Download the Extension
Download the `extension` folder from this project to your computer.

### Step 2: Load in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `extension` folder
5. The LinkedIn Auto Apply extension should now appear in your extensions list

### Step 3: Pin the Extension (Optional)
Click the puzzle piece icon in Chrome's toolbar and pin the LinkedIn Auto Apply extension for easy access.

## How to Use

1. **Configure Your Information**
   - Click the extension icon to open the popup
   - Fill in your full name, email, and phone number
   - Click "Save Settings"

2. **Navigate to LinkedIn Jobs**
   - Go to [LinkedIn Jobs](https://www.linkedin.com/jobs)
   - Search for jobs you're interested in
   - The job search results page will display

3. **Start Auto-Applying**
   - Click the extension icon
   - Click "Start Auto Apply"
   - The extension will begin processing jobs automatically

4. **Monitor Progress**
   - Watch the "Applied" and "Skipped" counters in the popup
   - The extension processes one job at a time
   - Click "Stop" at any time to pause the process

## How It Works

1. The extension scans the LinkedIn job search results page for job listings
2. For each job, it clicks the job card to view details
3. If an "Easy Apply" button is found, it clicks it
4. The extension fills in your pre-saved information in the application form
5. It attempts to submit the application automatically
6. If additional information is required, the job is skipped
7. The process continues to the next job

## Important Notes

- **LinkedIn Terms of Service**: Use this extension responsibly and in accordance with LinkedIn's terms of service
- **Manual Review**: Some applications may require manual input or custom answers
- **Resume Upload**: Make sure you have a resume uploaded to your LinkedIn profile
- **Rate Limiting**: LinkedIn may throttle or block rapid application submissions
- **Testing**: Test the extension with a few jobs first before running on many jobs

## Limitations

- Only works with LinkedIn's "Easy Apply" feature
- Cannot answer complex screening questions or essay-type questions
- May skip jobs that require additional manual input
- Requires you to have a resume uploaded to your LinkedIn profile

## Troubleshooting

**Extension not working:**
- Make sure you're on a LinkedIn job search results page
- Check that you've saved your information in the extension settings
- Reload the LinkedIn page and try again

**Jobs being skipped:**
- Some jobs may not have Easy Apply enabled
- Some applications may require custom answers that the extension cannot provide
- Check the browser console for error messages

**Application not submitting:**
- The job may require additional information not available in your saved settings
- Try applying to the job manually to see what's required

## Privacy

This extension stores your name, email, and phone number locally in your browser. No data is sent to external servers.

## Version

Version 1.0.0
