# LinkedIn Auto Apply Chrome Extension

## Overview
This Chrome extension automates the job application process on LinkedIn using its "Easy Apply" feature. It streamlines job searching by automatically filling out application forms and submitting them, tracking application statuses, and navigating job listings efficiently. The project aims to reduce the manual effort involved in applying for numerous jobs, offering features like smart form auto-fill, skill-based question detection, and application tracking. It operates purely client-side within the browser, requiring no backend.

## User Preferences
Not specified.

## System Architecture
The project is structured as a Chrome Manifest V3 extension.
- **`manifest.json`**: Defines the extension's configuration.
- **`popup.html/popup.js/popup.css`**: Provides the user interface for controlling the extension and configuring user profiles.
- **`content.js`**: Operates on LinkedIn job pages to automate form filling and application submission.
- **`background.js`**: Functions as the service worker, managing the extension's lifecycle and handling background tasks like API integrations.
- **UI/UX Decisions**: The extension provides a side panel UI for user interaction, including configuration of profile details, application tracking, and history. Visual elements include job card highlighting, status badges, and per-job timers.
- **Technical Implementations**:
    - **Form Auto-fill**: Automatically populates application fields (name, email, phone, skills, gender, disability, relocation willingness).
    - **Skill Question Detection**: Intelligently identifies and answers skill-related questions based on user-configured skills and experience. It supports various question types (years of experience, proficiency levels, yes/no) with fuzzy matching for skill names.
    - **Job Status Detection**: Detects "Easy Apply" availability and whether a job has been "Already Applied" from both job cards and details panes.
    - **Application Workflow**: Manages the sequence of applications, handles pagination, includes per-job timeouts, and auto-closes confirmation modals post-submission.
    - **Error Handling**: Includes robust error handling to prevent crashes and ensure correct job status marking, especially on failure.
    - **Job History**: Tracks applied, skipped, and failed jobs with details like title, company, and status, viewable in a searchable, filterable table within the popup.
    - **Sequential Processing**: Ensures jobs are processed one by one, with a consistent delay between applications to avoid rate limiting.
    - **Demographic Information**: Includes fields for gender and disability status to auto-fill corresponding application questions.
    - **Checkbox Automation**: Automatically checks general checkboxes (terms, privacy, etc.) while intelligently skipping preference-based ones.
- **System Design Choices**: The extension operates entirely client-side, storing all user data locally in Chrome storage, thus requiring no external backend or database. It utilizes the Replit environment to serve a documentation page (`index.html`) explaining how to install and use the extension, with `server.js` acting as a Node.js HTTP server.

## External Dependencies
- **Google Places API**: Integrated for real-time location suggestions and auto-filling location fields in application forms. (Requires user-provided API key).