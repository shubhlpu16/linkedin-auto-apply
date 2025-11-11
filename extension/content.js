let isRunning = false
let userData = {}
let processedJobs = new Set()
let currentJobIndex = 0
let jobCards = []
let currentPage = 1
let delayRange = { min: 5000, max: 12000 } // configurable delay (in ms)
let jobAttempts = new Map()
let perJobTimeoutSeconds = 60 // default per-job timeout (seconds) - reasonable timeout for processing
const MANUAL_REVIEW_SECONDS = 300 // 5 minutes for manual review
let contentRunElapsed = 0
let contentRunInterval = null
let contentRunBadge = null
let perJobRingTimers = false
let compactTimerFormat = false
let totalEasyApplyJobs = 0
let currentJobNumber = 0

// Common selectors across multiple LinkedIn job-list layouts. Kept broad to
// maximize coverage (search results, two-pane, seven-up, home module, collections, etc.).
const JOB_CARD_SELECTORS = [
        '.jobs-search-results__list li',
        '.jobs-search__results-list li',
        '.jobs-search-results li',
        '.jobs-search-two-pane__results-list li',
        '.jobs-search-seven-up__list li',
        '.jobs-home-jobs-module__list li',
        '.jobs-search-vertical__results-list li',
        '.scaffold-layout__list-container li',
        '.jobs-search-results-list__list-item',
        'li.jobs-search-results__list-item',
        'li.reusable-search__result-container',
        'li.job-card-container',
        'li.job-card-list__item',
        'li.jobs-search-two-pane__job-card-container',
        '.jobs-collection__list-item',
        '.jobs-collections__list-item',
        'li.scaffold-layout__list-item',
        '.job-card-container--clickable',
        '.reusable-search-simple-insight__container',
        'div.job-card-container',
        '.artdeco-list__item',
]

// Click targets inside a job card to reliably open job details across layouts.
const JOB_CLICK_TARGET_SELECTORS = [
        'a.job-card-list__title',
        '.job-card-container__link',
        'a[href*="/jobs/view/"]',
        '.job-card-list__title a',
        '.result-card__full-card-link',
        'a[data-control-name="search_srp_result"]',
]

// forward-declare markJobStatus so callers earlier in the file won't crash
function markJobStatus(card, status) {
        // noop until real implementation later in the file
}

// Remove any UI artifacts (timers, status labels) left behind by the script.
function cleanupJobUI() {
        try {
                // remove per-job timer badges
                const timers = document.querySelectorAll('.li-auto-apply__timer')
                timers.forEach((t) => { try { t.remove() } catch (e) { } })

                // remove status labels
                const labels = document.querySelectorAll('.li-auto-apply-statuslabel')
                labels.forEach((l) => { try { l.remove() } catch (e) { } })

                // remove marker classes and inline backgrounds from job cards
                const marked = document.querySelectorAll('.li-auto-apply--processing, .li-auto-apply--applied, .li-auto-apply--skipped, .li-auto-apply--stopped')
                marked.forEach((el) => {
                        try {
                                el.classList.remove('li-auto-apply--processing', 'li-auto-apply--applied', 'li-auto-apply--skipped', 'li-auto-apply--stopped')
                                // clear inline background styles if they were set
                                el.style.backgroundColor = ''
                        } catch (e) { }
                })

                // clear jobCards state
                try { jobCards = [] } catch (e) { }
                try { jobAttempts = new Map() } catch (e) { }
                try { processedJobs = new Set() } catch (e) { }

                // clear any floating run badge if present
                try { if (contentRunBadge) { contentRunBadge.remove(); contentRunBadge = null } } catch (e) { }
                contentRunElapsed = 0
        } catch (e) {
                console.debug('cleanupJobUI error', e)
        }
}

function findEasyApplyButton() {
        // CRITICAL: Use specific LinkedIn DOM IDs and check span content for foolproof detection
        const summarizeEl = (el) => {
                if (!el) return null
                try {
                        return {
                                tag: el.tagName,
                                text: (el.textContent || '').trim().slice(0, 120),
                                aria: el.getAttribute && el.getAttribute('aria-label'),
                                disabled: !!el.disabled,
                                visible: !!(el.offsetParent || (el.getClientRects && el.getClientRects().length)),
                        }
                } catch (e) { return { tag: el.tagName } }
        }
        
        const isEasyApplyButton = (btn) => {
                if (!btn || btn.disabled) return false
                const text = (btn.textContent || '').toLowerCase().trim()
                const ariaLabel = (btn.getAttribute && btn.getAttribute('aria-label') || '').toLowerCase().trim()
                const dataAttr = btn.getAttribute && btn.getAttribute('data-is-easy-apply')
                
                // Accept "easy apply" OR just "apply" with easy apply data attribute
                const hasEasyApplyText = text.includes('easy apply') || ariaLabel.includes('easy apply')
                const hasApplyText = text.includes('apply') || ariaLabel.includes('apply')
                const hasEasyApplyAttr = dataAttr === 'true' || dataAttr === '1'
                
                // Be less strict: accept "Apply" button that's not "Applied" or "Application sent"
                const isAppliedButton = text.includes('applied') || text.includes('application sent') || ariaLabel.includes('applied')
                
                return (hasEasyApplyText || (hasApplyText && !isAppliedButton) || hasEasyApplyAttr)
        }

        const debugInfo = { scope: 'global', triedSelectors: [], method: null, matchedSelector: null, timestamp: Date.now() }

        // MOST RELIABLE: Check for specific LinkedIn Easy Apply button ID
        try {
                const applyButtonById = document.getElementById('jobs-apply-button')
                if (applyButtonById && !applyButtonById.disabled) {
                        // Check if the span inside contains "Easy Apply"
                        const span = applyButtonById.querySelector('span')
                        const spanText = (span?.textContent || applyButtonById.textContent || '').toLowerCase().trim()
                        if (spanText.includes('easy apply')) {
                                debugInfo.method = 'id #jobs-apply-button with Easy Apply span (MOST RELIABLE)'
                                debugInfo.matchedSelector = '#jobs-apply-button'
                                debugInfo.elementSummary = summarizeEl(applyButtonById)
                                console.log('✓ Easy Apply button found via #jobs-apply-button (MOST RELIABLE)')
                                try { window.__li_lastEasyApply = debugInfo } catch (e) { }
                                return applyButtonById
                        } else {
                                console.log('⚠️ #jobs-apply-button found but span text is:', spanText)
                        }
                }
        } catch (e) {
                console.debug('Error checking #jobs-apply-button:', e)
        }

        // Priority selectors for detail pane - BUT verify they contain "Easy Apply" text
        const selectors = [
                'button[aria-label*="Easy Apply"]',
                'button[data-control-name*="jobdetails_topcard_inapply"]',
                'button.jobs-apply-button',
                'button[data-test-global-apply-button]',
                '.jobs-apply-button--top-card button',
                'button.jobs-apply-button--top-card',
                'button[data-test-apply-button]',
                '.jobs-unified-top-card__content--two-pane button.jobs-apply-button',
                '.jobs-details__main-content button',
                'button.artdeco-button--primary',
                'a[role="button"]',
        ]

        // Search globally (detail pane) and validate "Easy Apply" text
        for (const selector of selectors) {
                debugInfo.triedSelectors.push(selector)
                try {
                        const btn = document.querySelector(selector)
                        if (btn && isEasyApplyButton(btn)) {
                                debugInfo.method = 'selector + text validation'
                                debugInfo.matchedSelector = selector
                                debugInfo.elementSummary = summarizeEl(btn)
                                console.log('✓ Easy Apply button found:', selector)
                                try { window.__li_lastEasyApply = debugInfo } catch (e) { }
                                return btn
                        }
                } catch (e) { }
        }

        // Fallback: scan all buttons for "Easy Apply" text
        try {
                const allButtons = [...document.querySelectorAll('button, a[role="button"]')]
                for (const btn of allButtons) {
                        if (isEasyApplyButton(btn)) {
                                debugInfo.method = 'text scan'
                                debugInfo.elementSummary = summarizeEl(btn)
                                console.log('✓ Easy Apply button found via text scan')
                                try { window.__li_lastEasyApply = debugInfo } catch (e) { }
                                return btn
                        }
                }
        } catch (e) { }

        // Not found
        console.log('✗ No Easy Apply button found (strict validation)')
        try { window.__li_lastEasyApply = debugInfo } catch (e) { }
        return null
}

// Helper function to check if job card footer indicates Easy Apply availability
function hasEasyApplyInFooter(jobCard) {
        if (!jobCard) return false
        
        try {
                // Check job card footer for "Easy Apply" indicator
                const footerSelectors = [
                        '.job-card-container__footer-item',
                        '.job-card-list__footer',
                        '.job-card-container__footer-wrapper',
                        '.job-card-container__footer',
                        '.artdeco-entity-lockup__caption'
                ]
                
                for (const selector of footerSelectors) {
                        const footerEl = jobCard.querySelector(selector)
                        if (footerEl) {
                                const footerText = (footerEl.textContent || '').toLowerCase()
                                // Look for "Easy Apply" in patterns like "Viewed · Promoted · Easy Apply"
                                if (footerText.includes('easy apply')) {
                                        console.log('✓ Easy Apply indicator found in job card footer')
                                        return true
                                }
                        }
                }
                
                // Also check for LinkedIn icon with Easy Apply text
                const easyApplyIcons = jobCard.querySelectorAll('[data-test-icon="linkedin-logo-compact"], .job-card-container__footer-item')
                for (const icon of easyApplyIcons) {
                        const parent = icon.parentElement || icon
                        const text = (parent.textContent || '').toLowerCase()
                        if (text.includes('easy apply')) {
                                console.log('✓ Easy Apply indicator found near LinkedIn icon in footer')
                                return true
                        }
                }
        } catch (e) {
                console.debug('hasEasyApplyInFooter error', e)
        }
        
        return false
}

// Start processing helpers: collect job cards and iterate sequentially
async function startProcessing() {
        console.log('🚀 Starting auto-apply...')
        processedJobs = new Set()
        jobCards = []
        currentJobIndex = 0
        currentPage = 1
        currentJobNumber = 0
        totalEasyApplyJobs = 0
        limitNotified = false
        await pushStatsUpdate({ isRunning: true })
        await randomDelay()
        await autoScrollJobsList()
        await collectJobCards()
        
        if (jobCards.length === 0) {
                showToast('⚠️ No jobs found on this page.', 'error')
                isRunning = false
                await pushStatsUpdate({ isRunning: false })
                return
        }
        
        console.log(`📊 Found ${jobCards.length} total jobs to process sequentially from job 1`)
        console.log(`🎯 Starting from first job card (index 0)`)
        showToast(`🚀 Starting from FIRST job - Processing ${jobCards.length} jobs...`, 'success')
        currentJobIndex = 0
        await processNextJob()
}

async function collectJobCards() {
        const seenElements = new Set()
        const seenJobIds = new Set()
        const collected = []
        let totalScanned = 0
        let filtered = { noJobId: 0, alreadyProcessed: 0, hasDisqualifier: 0 }

        for (const selector of JOB_CARD_SELECTORS) {
                const nodes = document.querySelectorAll(selector)
                if (!nodes?.length) continue
                nodes.forEach((node) => {
                        if (seenElements.has(node)) return
                        seenElements.add(node)
                        totalScanned++
                        
                        const jobId = getJobIdFromElement(node)
                        if (!jobId) {
                                filtered.noJobId++
                                return
                        }
                        if (processedJobs.has(jobId) || seenJobIds.has(jobId)) {
                                filtered.alreadyProcessed++
                                return
                        }
                        if (jobCardHasDisqualifier(node)) {
                                filtered.hasDisqualifier++
                                console.log(`⏭️ Filtered job ${jobId} - disqualifier found`)
                                return
                        }
                        node.dataset.liAutoApplyJobId = jobId
                        seenJobIds.add(jobId)
                        collected.push(node)
                })
        }

        jobCards = collected
        console.log(`📄 Scanned ${totalScanned} cards, found ${jobCards.length} eligible jobs on page ${currentPage}`)
        console.log(`   Filtered: ${filtered.noJobId} (no ID), ${filtered.alreadyProcessed} (already processed), ${filtered.hasDisqualifier} (disqualifier)`)
        
        // Log the first 3 jobs to help with debugging
        if (jobCards.length > 0) {
                console.log(`🎯 First jobs in queue:`)
                jobCards.slice(0, 3).forEach((card, idx) => {
                        const details = getJobDetailsFromCard(card)
                        console.log(`   ${idx + 1}. ${details.jobTitle} at ${details.company} (ID: ${details.jobId})`)
                })
        }
}

// Show a dismissible countdown before moving to next job. Resolves when timer
// elapses or when user clicks Skip. Returns a promise.
function showNextJobCountdown(seconds = 30) {
        return new Promise((resolve) => {
                try {
                        // if an overlay already exists, remove it
                        const existing = document.getElementById('li-auto-apply-next-countdown')
                        if (existing) try { existing.remove() } catch (e) { }

                        const overlay = document.createElement('div')
                        overlay.id = 'li-auto-apply-next-countdown'
                        overlay.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:12px 16px;border-radius:8px;z-index:999999;font-weight:600;display:flex;align-items:center;gap:12px;'
                        const text = document.createElement('span')
                        text.textContent = `Next job in ${seconds}s`
                        const skipBtn = document.createElement('button')
                        skipBtn.textContent = 'Skip waiting'
                        skipBtn.style.cssText = 'background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-weight:700'

                        overlay.appendChild(text)
                        overlay.appendChild(skipBtn)
                        document.body.appendChild(overlay)

                        let remaining = seconds
                        const id = setInterval(() => {
                                remaining -= 1
                                text.textContent = `Next job in ${remaining}s`
                                if (remaining <= 0) {
                                        clearInterval(id)
                                        try { overlay.remove() } catch (e) { }
                                        resolve('timeout')
                                }
                        }, 1000)

                        const onSkip = () => {
                                try { clearInterval(id) } catch (e) { }
                                try { overlay.remove() } catch (e) { }
                                resolve('skipped')
                        }
                        skipBtn.addEventListener('click', onSkip)
                } catch (e) {
                        console.debug('showNextJobCountdown error', e)
                        resolve('error')
                }
        })
}

// Helper to advance to next job and continue processing
async function advanceAndContinue() {
        currentJobIndex++
        return await processNextJob()
}

async function processNextJob() {
        if (!isRunning) return console.log('⏹️ Process stopped')

        // End of current page
        if (currentJobIndex >= jobCards.length) {
                console.log(`✅ Completed page ${currentPage}, moving to next...`)
                const nextBtn = document.querySelector(
                        'button[aria-label="Next"], button.artdeco-pagination__button--next',
                )
                if (nextBtn && !nextBtn.disabled) {
                        nextBtn.click()
                        currentPage++
                        await randomDelay(4000, 6000)
                        await autoScrollJobsList()
                        await collectJobCards()
                        currentJobIndex = 0
                        return processNextJob()
                }
                console.log('🎉 All pages processed.')
                isRunning = false
                await pushStatsUpdate({ isRunning: false })
                stopContentRunTimer()
                return
        }

        if (currentJobIndex > 0 && currentJobIndex % 5 === 0) {
                await autoScrollJobsList()
                await collectJobCards()
                currentJobIndex = 0
        }

        const jobCard = jobCards[currentJobIndex]
        if (!jobCard) {
                console.log('⚠️ No job card at index', currentJobIndex)
                currentJobIndex++
                if (!isRunning) return
                return await processNextJob()
        }
        
        const jobId = getJobIdFromElement(jobCard)
        const jobDetails = getJobDetailsFromCard(jobCard)

        if (!jobId) {
                console.log(`⚠️ No jobId found for card at index ${currentJobIndex}, retrying...`)
                // Don't increment index yet - retry same card
                if (!isRunning) return
                await randomDelay(500, 1000)
                return await processNextJob()
        }
        
        if (processedJobs.has(jobId)) {
                console.log(`⏭️ Job ${jobId} already processed, moving to next`)
                if (!isRunning) return
                await randomDelay(200, 500)
                return await advanceAndContinue()
        }
        
        // NOTE: Do NOT increment currentJobIndex here - we increment AFTER job processing
        // completes to ensure all status marking uses the correct job card

        // Track attempts per job and avoid infinite retries
        const attempts = jobAttempts.get(jobId) || 0
        if (attempts >= 3) {
                console.log(`⚠️ Job ${jobId} exceeded attempt limit, skipping`)
                processedJobs.add(jobId)
                try { await saveJobToHistory(jobDetails, 'skipped_max_attempts') } catch (e) { console.debug('saveJobToHistory error', e) }
                await incrementSkipped()
                markJobStatus(jobCard, 'skipped')
                if (!isRunning) return
                // Use consistent 10-second wait
                console.log('⏱️ Waiting 10 seconds before next job...')
                try {
                        const choice = await showNextJobCountdown(10)
                        console.log('Next-job countdown result:', choice)
                } catch (e) { console.debug('countdown failed', e) }
                return await advanceAndContinue()
        }
        jobAttempts.set(jobId, attempts + 1)

        jobCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // mark visually as processing
        markJobStatus(jobCard, 'processing')
        const jobTimer = attachTimerToJob(jobCard, perJobTimeoutSeconds, async () => {
                console.log(`⏱️ Job ${jobId} timed out, skipping`)
                // ensure modal closed and mark skipped
                closeModal()
                processedJobs.add(jobId)
                await incrementSkipped()
                jobTimer.clear()
                if (isRunning) processNextJob()
        })
        await openJobCard(jobCard)
        console.log(`🧾 Opening job ${jobId}`)
        await randomDelay(2500, 4000)

        // CRITICAL: Verify the correct job loaded in detail pane before proceeding
        const loadedJobId = await waitForCorrectJobToLoad(jobId, 5000)
        if (!loadedJobId) {
                console.log(`⚠️ Job ${jobId} detail pane did not load correctly, skipping`)
                processedJobs.add(jobId)
                markJobStatus(jobCard, 'skipped')
                jobTimer.clear()
                try { await saveJobToHistory(jobDetails, 'skipped_load_failed') } catch (e) { console.debug('saveJobToHistory error', e) }
                await incrementSkipped()
                if (!isRunning) return
                // Use consistent 10-second wait
                console.log('⏱️ Waiting 10 seconds before next job...')
                try {
                        const choice = await showNextJobCountdown(10)
                        console.log('Next-job countdown result:', choice)
                } catch (e) { console.debug('countdown failed', e) }
                return await advanceAndContinue()
        }

        // Skip if job is already applied
        if (isAlreadyApplied(jobCard)) {
                console.log(`⏭️ Skipping already applied job ${jobId}`)
                processedJobs.add(jobId)
                markJobStatus(jobCard, 'applied')
                jobTimer.clear()
                try { await saveJobToHistory(jobDetails, 'already_applied') } catch (e) { console.debug('saveJobToHistory error', e) }
                await incrementSkipped()
                if (!isRunning) return
                // Use consistent 10-second wait
                console.log('⏱️ Waiting 10 seconds before next job...')
                try {
                        const choice = await showNextJobCountdown(10)
                        console.log('Next-job countdown result:', choice)
                } catch (e) { console.debug('countdown failed', e) }
                return await advanceAndContinue()
        }

        // Wait for detail pane to load, then find Easy Apply button GLOBALLY
        await randomDelay(1000, 1500)
        const easyApplyButton = findEasyApplyButton()
        if (!easyApplyButton) {
                console.log(`🚫 No Easy Apply found for job ${jobId} [${currentJobIndex}/${jobCards.length}]`)
                processedJobs.add(jobId)
                markJobStatus(jobCard, 'skipped')
                jobTimer.clear()
                try { await saveJobToHistory(jobDetails, 'skipped_no_easy_apply') } catch (e) { console.debug('saveJobToHistory error', e) }
                await incrementSkipped()
                if (!isRunning) return
                // Use consistent 10-second wait
                console.log('⏱️ Waiting 10 seconds before next job...')
                try {
                        const choice = await showNextJobCountdown(10)
                        console.log('Next-job countdown result:', choice)
                } catch (e) { console.debug('countdown failed', e) }
                return await advanceAndContinue()
        }

        // Found Easy Apply - increment counter and show progress
        totalEasyApplyJobs++
        currentJobNumber++
        const progressMsg = `[${currentJobNumber} Easy Apply] Job ${currentJobIndex}/${jobCards.length}`
        console.log(`🪄 ${progressMsg} Applying to job ${jobId}`)
        
        // Mark that this job HAD Easy Apply button before we clicked it
        // This helps verify success: Easy Apply → Already Applied = SUCCESS
        jobCard.dataset.hadEasyApply = 'true'
        
        showProgressToast(currentJobNumber, currentJobIndex, jobCards.length)
        try { triggerClick(easyApplyButton) } catch (e) { try { easyApplyButton.click() } catch (e2) { console.debug('click failed', e2) } }
        await randomDelay(2000, 3500)

        // Ensure the Easy Apply modal actually opened
        const modalCheck = await waitForSelector('.jobs-easy-apply-modal, [role="dialog"], .jobs-details__main-content, button.jobs-apply-button, button[data-test-apply-button]', 4000)
        if (!modalCheck) {
                console.log(`⚠️ Easy Apply modal did not appear for job ${jobId}, skipping`)
                processedJobs.add(jobId)
                markJobStatus(jobCard, 'skipped')
                jobTimer.clear()
                try { await saveJobToHistory(jobDetails, 'skipped_modal_failed') } catch (e) { console.debug('saveJobToHistory error', e) }
                await incrementSkipped()
                if (!isRunning) return
                // Use consistent 10-second wait
                console.log('⏱️ Waiting 10 seconds before next job...')
                try {
                        const choice = await showNextJobCountdown(10)
                        console.log('Next-job countdown result:', choice)
                } catch (e) { console.debug('countdown failed', e) }
                return await advanceAndContinue()
        }

        const result = await fillApplicationForm()
        // clear processing visual/timer
        try {
                if (jobTimer && jobTimer.clear) jobTimer.clear()
        } catch (e) { }

        if (result === 'applied') {
                // Do extra verification to ensure the apply actually succeeded (toast or card change)
                let confirmed = false
                try {
                        confirmed = await verifyApplySuccess(jobCard, 15000)
                } catch (e) { console.debug('verifyApplySuccess failed', e) }
                if (confirmed) {
                        processedJobs.add(jobId)
                        markJobStatus(jobCard, 'applied')
                        try { await saveJobToHistory(jobDetails, 'applied') } catch (e) { console.debug('saveJobToHistory error', e) }
                        try { await incrementApplied() } catch (e) { console.debug('incrementApplied failed', e) }
                } else {
                        console.log(`⚠️ Could not verify apply success for job ${jobId}, but modal closed - assuming applied`)
                        processedJobs.add(jobId)
                        markJobStatus(jobCard, 'applied')
                        try { await saveJobToHistory(jobDetails, 'applied') } catch (e) { console.debug('saveJobToHistory error', e) }
                        try { await incrementApplied() } catch (e) { console.debug('incrementApplied failed', e) }
                }

        } else if (result === 'skipped') {
                processedJobs.add(jobId)
                markJobStatus(jobCard, 'skipped')
                try { await saveJobToHistory(jobDetails, 'skipped') } catch (e) { console.debug('saveJobToHistory error', e) }
        } else if (result === 'stopped') {
                markJobStatus(jobCard, 'stopped')
                try { await saveJobToHistory(jobDetails, 'stopped') } catch (e) { console.debug('saveJobToHistory error', e) }
                return
        } else if (result === 'failed') {
                processedJobs.add(jobId)
                markJobStatus(jobCard, 'failed')
                try { await saveJobToHistory(jobDetails, 'failed') } catch (e) { console.debug('saveJobToHistory error', e) }
                try { await incrementFailed() } catch (e) { console.debug('incrementFailed failed', e) }
        }

        if (!isRunning) return
        
        // Consistent 10-second wait before moving to next job
        console.log('⏱️ Waiting 10 seconds before next job...')
        try {
                const choice = await showNextJobCountdown(10)
                console.log('Next-job countdown result:', choice)
        } catch (e) { console.debug('countdown failed', e) }
        
        await advanceAndContinue()
}

// After submit/modal-close, do extra checks to robustly detect a successful apply.
// IMPROVED: Check specific LinkedIn DOM IDs and elements for foolproof detection
// KEY LOGIC: If job had "Easy Apply" button before, and now shows "already applied", that's SUCCESS
async function verifyApplySuccess(jobCard, timeoutMs = 20000) {
        const end = Date.now() + Math.max(0, timeoutMs)
        const successPhrases = ['applied', 'submitted', 'application submitted', 'application sent', 'in progress']
        const toastSelectors = ['.artdeco-toast-item--success', '.artdeco-toast-item__message', '.artdeco-toast-item']
        
        let modalClosedAt = null
        const hadEasyApplyBefore = jobCard?.dataset?.hadEasyApply === 'true'
        
        while (Date.now() <= end) {
                try {
                        // MOST RELIABLE: Check for "See application" link that appears after successful apply
                        const seeApplicationLink = document.getElementById('jobs-apply-see-application-link')
                        if (seeApplicationLink) {
                                console.log('✓ Apply verified via #jobs-apply-see-application-link (MOST RELIABLE)')
                                return true
                        }
                        
                        // FOOLPROOF LOGIC: If this job had "Easy Apply" before, and now shows "already applied", that's definitive success
                        if (hadEasyApplyBefore && isAlreadyApplied(jobCard)) {
                                console.log('✓ Apply verified: Easy Apply → Already Applied transition (DEFINITIVE PROOF)')
                                return true
                        }
                        
                        // 1) Check for success toast messages
                        for (const sel of toastSelectors) {
                                const t = document.querySelector(sel)
                                if (t && t.textContent) {
                                        const txt = t.textContent.toLowerCase()
                                        if (successPhrases.some((p) => txt.includes(p))) {
                                                console.log('✓ Apply verified via toast')
                                                return true
                                        }
                                }
                        }

                        // 2) Check unified top card apply result (modern LinkedIn)
                        const applyResult = document.querySelector('.jobs-unified-top-card__apply-result, .jobs-unified-top-card__subtitle-secondary-grouping')
                        if (applyResult && applyResult.textContent) {
                                const txt = applyResult.textContent.toLowerCase()
                                if (successPhrases.some((p) => txt.includes(p))) {
                                        console.log('✓ Apply verified via unified top card')
                                        return true
                                }
                        }

                        // 3) Check confirmation dialog/modal
                        const confirmDialog = document.querySelector('[role="dialog"] [data-test-modal-id="application-sent-confirmation"]')
                        const confirmText = document.querySelector('[aria-label*="Application sent"]')
                        if (confirmDialog || confirmText) {
                                console.log('✓ Apply verified via confirmation dialog')
                                return true
                        }

                        // 4) Check the job card text for applied-like words
                        if (jobCard && jobCard.innerText) {
                                const txt = jobCard.innerText.toLowerCase()
                                if (successPhrases.some((p) => txt.includes(p))) {
                                        console.log('✓ Apply verified via job card text')
                                        return true
                                }
                        }

                        // 5) Check if Easy Apply button changed to "Applied"
                        const appliedBtn = document.querySelector('button[aria-label*="Applied"], .jobs-apply-button--applied')
                        if (appliedBtn) {
                                console.log('✓ Apply verified via button state')
                                return true
                        }

                        // 6) Track when modal closes
                        const modal = getApplyModal()
                        if (!modal && !modalClosedAt) {
                                modalClosedAt = Date.now()
                        }
                        
                        // If modal has been closed for >2 seconds and no errors, assume success
                        if (modalClosedAt && (Date.now() - modalClosedAt > 2000)) {
                                const errorToast = document.querySelector('.artdeco-toast-item--error')
                                if (!errorToast) {
                                        console.log('✓ Apply verified via modal close without errors')
                                        return true
                                }
                                console.log('✗ Error toast detected, apply failed')
                                return false
                        }
                } catch (e) {
                        console.debug('verifyApplySuccess error', e)
                }
                await new Promise((r) => setTimeout(r, 400))
        }
        console.log('✗ Apply verification timed out')
        return false
}

function isAlreadyApplied(jobCard) {
        try {
                // MOST RELIABLE: Check for "See application" link - definitive proof of already applied
                const seeApplicationLink = document.getElementById('jobs-apply-see-application-link')
                if (seeApplicationLink) {
                        console.log('✓ Already applied detected via #jobs-apply-see-application-link (job details)')
                        return true
                }
                
                // Check job details pane for "Applied X time ago" pattern
                const detailPane = document.querySelector('.jobs-unified-top-card, .jobs-details__main-content, .jobs-details')
                if (detailPane) {
                        const detailText = (detailPane.innerText || '').toLowerCase()
                        
                        // Pattern: "Applied 45 minutes ago" or "Applied on ..."
                        if (detailText.match(/applied\s+(\d+\s+)?(minute|hour|day|week|month)s?\s+ago/i) ||
                            detailText.match(/applied\s+on\s+/i) ||
                            detailText.includes('application sent') ||
                            detailText.includes('application submitted') ||
                            detailText.includes('see application')) {
                                console.log('✓ Already applied detected in job details pane')
                                return true
                        }
                }
                
                // Check job card footer for "Applied" status (appears below location/company)
                if (jobCard) {
                        // Check for footer elements that contain "Applied"
                        const footerSelectors = [
                                '.job-card-container__footer-item',
                                '.job-card-list__footer',
                                '.job-card-container__footer-wrapper',
                                '.artdeco-entity-lockup__caption',
                                '.job-card-container__metadata-item'
                        ]
                        
                        for (const selector of footerSelectors) {
                                const footerEl = jobCard.querySelector(selector)
                                if (footerEl) {
                                        const footerText = (footerEl.textContent || '').trim().toLowerCase()
                                        if (footerText === 'applied' || footerText.startsWith('applied ')) {
                                                console.log('✓ Already applied detected in job card footer:', footerText)
                                                return true
                                        }
                                }
                        }
                        
                        // Check all job card text as fallback
                        const cardText = (jobCard.innerText || '').toLowerCase()
                        if (cardText.includes('application submitted') ||
                            cardText.includes('no longer accepting') ||
                            cardText.includes('application in progress')) {
                                console.log('✓ Already applied detected in job card text')
                                return true
                        }
                }
                
                // Check for "Applied" button state
                const appliedBtn = document.querySelector('button[aria-label*="Applied"], .jobs-apply-button--applied')
                if (appliedBtn) {
                        console.log('✓ Already applied detected via Applied button')
                        return true
                }
                
                return false
        } catch (e) {
                console.debug('isAlreadyApplied error', e)
                return false
        }
}

async function fillApplicationForm() {
        let attempts = 0
        while (attempts < 25 && isRunning) {
                let modal = getApplyModal()
                if (!modal) {
                        await randomDelay(500, 1000)
                        modal = getApplyModal()
                        if (!modal) return 'skipped'
                }

                await fillFormFields(modal)
                await randomDelay(1200, 2000)

                if (detectLinkedInLimit()) {
                        await handleLinkedInLimit()
                        closeModal()
                        return 'stopped'
                }

                modal = getApplyModal()
                if (!modal) {
                        console.log('✅ Application submitted!')
                        return 'applied'
                }

                const outcome = await attemptModalProgress(modal)
                if (outcome === 'submitted') return 'applied'
                if (outcome === 'stopped') return 'stopped'
                if (outcome === 'manualPause') {
                        const decision = await waitForManualInput(MANUAL_REVIEW_SECONDS)
                        if (decision === 'skip') {
                                console.log('⏭️ Job skipped by user during manual review.')
                                await incrementSkipped()
                                closeModal()
                                return 'skipped'
                        }
                        if (decision !== 'resume') {
                                console.log('⚠️ Manual review cancelled, skipping job.')
                                if (isRunning) await incrementSkipped()
                                closeModal()
                                return 'skipped'
                        }
                }
                if (outcome === 'advance' || outcome === 'waiting') {
                        await randomDelay(800, 1200)
                }
                attempts++
        }

        console.log('⚠️ Could not complete form, skipping')
        // treat inability to complete the form after retries as a failure (attempted but failed)
        try { await incrementFailed() } catch (e) { console.debug('incrementFailed failed', e) }
        closeModal()
        return 'failed'
}

async function attemptModalProgress(modal) {
        if (hasUnansweredRequired(modal)) {
                return 'manualPause'
        }
        const submitBtn = findButton(modal, ['Submit application', 'Submit'])
        if (submitBtn) {
                if (submitBtn.disabled) return 'manualPause'
                submitBtn.click()
                const result = await evaluateAfterClick({ allowContinue: false })
                return result
        }

        const nextBtn = findButton(modal, ['Next', 'Review', 'Continue'])
        if (nextBtn) {
                if (nextBtn.disabled) return 'manualPause'
                nextBtn.click()
                
                // Wait briefly for validation to appear
                await randomDelay(800, 1200)
                
                // Check for validation errors after clicking Next
                const modalNow = getApplyModal()
                if (modalNow && hasBlockingErrors(modalNow)) {
                        console.log('⚠️ LinkedIn validation error detected after clicking Next - triggering manual pause')
                        return 'manualPause'
                }
                
                const result = await evaluateAfterClick({ allowContinue: true })
                return result
        }

        if (detectLinkedInLimit()) {
                await handleLinkedInLimit()
                closeModal()
                return 'stopped'
        }

        if (hasBlockingErrors(modal) || hasUnansweredRequired(modal)) {
                return 'manualPause'
        }

        return 'waiting'
}

async function evaluateAfterClick({ allowContinue = false } = {}) {
        await randomDelay(1500, 2500)
        if (detectLinkedInLimit()) {
                await handleLinkedInLimit()
                closeModal()
                return 'stopped'
        }
        const modal = getApplyModal()
        if (!modal) {
                console.log('✅ Application submitted!')
                await randomDelay(1500, 2500)
                return 'submitted'
        }

        // If a confirmation / "Done" style button is shown in the modal, wait up to
        // 10 seconds for the modal to be closed (user may click Done). If it doesn't
        // close in time, treat as skipped and move on.
        try {
                const doneLike = [...modal.querySelectorAll('button')].find((b) => {
                        const t = (b.textContent || '').toLowerCase()
                        return /done|close|dismiss|finish|got it|all done|completed|finished/.test(t)
                })
                if (doneLike) {
                        const closed = await waitForModalClose(10)
                        if (closed) {
                                console.log('✅ Confirmation detected and modal closed')
                                await randomDelay(1500, 2500)
                                return 'submitted'
                        }
                        // timed out waiting for a confirmation/done click — treat as a failed submit
                        console.log('⏱️ Confirmation not clicked within 10s, marking as failed')
                        return 'failed'
                }
        } catch (e) {
                console.debug('Error checking for done-like button:', e)
        }
        if (hasBlockingErrors(modal) || hasUnansweredRequired(modal)) {
                return 'manualPause'
        }
        return allowContinue ? 'advance' : 'waiting'
}

async function waitForModalClose(seconds = 10) {
        const intervalMs = 500
        const max = Math.max(1, seconds) * 1000
        let waited = 0
        return await new Promise((resolve) => {
                let id = null
                let observer = null
                const listeners = new Map()

                function cleanupAndResolve(value) {
                        try {
                                if (id) clearInterval(id)
                                if (observer) observer.disconnect()
                                // remove any attached click listeners
                                for (const [el, fn] of listeners) {
                                        try { el.removeEventListener('click', fn) } catch (e) { }
                                }
                        } catch (e) { }
                        resolve(value)
                }

                // periodic check for modal removal
                id = setInterval(() => {
                        const modal = getApplyModal()
                        if (!modal) {
                                cleanupAndResolve(true)
                                return
                        }
                        waited += intervalMs
                        if (waited >= max) {
                                cleanupAndResolve(false)
                        }
                }, intervalMs)

                // attach click listeners to any done-like buttons inside the modal so we can
                // advance immediately when the user clicks them.
                try {
                        const attachToModal = (modalEl) => {
                                if (!modalEl) return
                                const buttons = [...modalEl.querySelectorAll('button')]
                                const doneRE = /done|close|dismiss|finish|got it|all done|completed|finished/i
                                for (const b of buttons) {
                                        const text = (b.textContent || b.getAttribute('aria-label') || '')
                                        if (!doneRE.test(text)) continue
                                        if (listeners.has(b)) continue
                                        const fn = () => cleanupAndResolve(true)
                                        listeners.set(b, fn)
                                        try { b.addEventListener('click', fn) } catch (e) { }
                                }
                        }

                        const modalNow = getApplyModal()
                        attachToModal(modalNow)

                        // observe modal for newly added buttons (some flows add a 'Done' after submit)
                        observer = new MutationObserver((mutations) => {
                                const modal = getApplyModal()
                                attachToModal(modal)
                        })
                        if (modalNow) {
                                try { observer.observe(modalNow, { childList: true, subtree: true }) } catch (e) { }
                        }
                } catch (e) {
                        // non-fatal; we still fall back to polling
                        console.debug('waitForModalClose: error attaching done-listeners', e)
                }
        })
}

async function waitForManualInput(seconds = MANUAL_REVIEW_SECONDS) {
        if (!isRunning) return 'cancel'
        console.log(`⏸️ Waiting for manual input for ${seconds} seconds`)
        try {
                await chrome.runtime.sendMessage({
                        action: 'manualPause',
                        seconds,
                        reason: 'formIncomplete',
                })
        } catch (error) {
                console.debug('Unable to notify popup for manual pause:', error)
        }
        return await new Promise((resolve) => {
                manualPauseResolver = resolve
        })
}

// ========================
// FILLING LOGIC HELPERS
// ========================
function fillFormFields(container) {
        fillTextInputs(container)
        fillEmailInputs(container)
        fillSelectFields(container)
        fillTextAreas(container)
        fillRadioButtons(container)
        fillSkillRelatedFields(container)
}

function fillTextInputs(container) {
        const inputs = container.querySelectorAll(
                'input[type="text"], input[type="tel"], input[type="url"], input[type="number"]',
        )
        inputs.forEach((input) => {
                if (input.value) return
                const label = getFieldLabel(input)
                const text = label.toLowerCase()
                const placeholder = (input.getAttribute('placeholder') || '').toLowerCase()
                const combined = text + ' ' + placeholder

                // Check for phone
                if (combined.includes('phone') || combined.includes('mobile') || combined.includes('telephone')) {
                        setInputValue(input, userData.phone)
                }
                // Check for location/city
                else if (combined.includes('city') || combined.includes('location') || combined.includes('address')) {
                        setInputValue(input, userData.location)
                }
                // Check for LinkedIn profile
                else if (combined.includes('linkedin') || combined.includes('profile url')) {
                        setInputValue(input, userData.linkedinProfile)
                }
                // Check for years of experience
                else if ((combined.includes('year') && combined.includes('experience')) || combined.includes('years of experience')) {
                        setInputValue(input, userData.yearsExperience)
                }
                // Check for notice period
                else if (combined.includes('notice') || combined.includes('availability')) {
                        setInputValue(input, userData.noticePeriod)
                }
                // Check for name (but not company name)
                else if ((combined.includes('name') || combined.includes('full name')) && !combined.includes('company') && !combined.includes('organization')) {
                        setInputValue(input, userData.fullName)
                }
                // Check for first name
                else if (combined.includes('first name')) {
                        const firstName = (userData.fullName || '').split(' ')[0]
                        setInputValue(input, firstName)
                }
                // Check for last name
                else if (combined.includes('last name') || combined.includes('surname')) {
                        const parts = (userData.fullName || '').split(' ')
                        const lastName = parts.length > 1 ? parts.slice(1).join(' ') : ''
                        setInputValue(input, lastName)
                }
        })
}

function fillEmailInputs(container) {
        container.querySelectorAll('input[type="email"]').forEach((i) => {
                if (!i.value) setInputValue(i, userData.email)
        })
}

function fillSelectFields(container) {
        container.querySelectorAll('select').forEach((select) => {
                if (select.value) return
                const label = getFieldLabel(select).toLowerCase()
                if (label.includes('authorization') && userData.workAuthorization) {
                        const option = [...select.options].find((o) =>
                                o.textContent
                                        .toLowerCase()
                                        .includes(userData.workAuthorization.toLowerCase()),
                        )
                        if (option) {
                                select.value = option.value
                                select.dispatchEvent(new Event('change', { bubbles: true }))
                        }
                }
        })
}

function fillTextAreas(container) {
        container.querySelectorAll('textarea').forEach((area) => {
                if (!area.value && userData.skills) {
                        const label = getFieldLabel(area)
                        if (label.includes('skill') || label.includes('expertise')) {
                                setInputValue(area, getSkillSummary())
                        }
                }
        })
}

function fillRadioButtons(container) {
        const radios = container.querySelectorAll('input[type="radio"]')
        const groups = {}
        radios.forEach((r) => (groups[r.name] = [...(groups[r.name] || []), r]))
        for (const group of Object.values(groups)) {
                if (group.some((r) => r.checked)) continue
                const label = getFieldLabel(group[0])
                if (label.includes('authorization') && userData.workAuthorization) {
                        const yes = group.find((r) =>
                                (r.getAttribute('aria-label') || '')
                                        .toLowerCase()
                                        .includes(userData.workAuthorization.toLowerCase()),
                        )
                        if (yes) yes.click()
                } else group[0].click()
        }
}

function fillSkillRelatedFields(container) {
        const entries = getSkillEntries()
        if (!entries.length) return
        const skillMap = new Map()
        entries.forEach((entry) => {
                if (!entry.name) return
                skillMap.set(entry.name.toLowerCase(), entry)
        })
        const years = userData.yearsExperience || '3'
        const yesLabels = ['yes', 'true', 'available', 'y']

        container
                .querySelectorAll('input[type="text"], input[type="number"]')
                .forEach((input) => {
                        if (input.value) return
                        const label = getFieldLabel(input).toLowerCase()
                        const skill = [...skillMap.keys()].find((s) => label.includes(s))
                        if (!skill) return
                        const entry = skillMap.get(skill)
                        const value = label.includes('year')
                                ? entry.experience || years
                                : entry.hasSkill === false
                                        ? 'No'
                                        : 'Yes'
                        setInputValue(input, value)
                })

        container.querySelectorAll('select').forEach((select) => {
                if (select.value) return
                const label = getFieldLabel(select).toLowerCase()
                const skill = [...skillMap.keys()].find((s) => label.includes(s))
                if (!skill) return
                const entry = skillMap.get(skill)
                const matchLabels = entry.hasSkill === false ? ['no', 'false'] : yesLabels
                const opt = [...select.options].find((option) =>
                        matchLabels.some((lbl) => option.textContent.toLowerCase().includes(lbl)),
                )
                if (opt) {
                        select.value = opt.value
                        select.dispatchEvent(new Event('change', { bubbles: true }))
                }
        })

        const radios = container.querySelectorAll('input[type="radio"]')
        const groups = {}
        radios.forEach((r) => (groups[r.name] = [...(groups[r.name] || []), r]))
        for (const group of Object.values(groups)) {
                if (group.some((r) => r.checked)) continue
                const label = getFieldLabel(group[0]).toLowerCase()
                const skill = [...skillMap.keys()].find((s) => label.includes(s))
                if (skill) {
                        const entry = skillMap.get(skill)
                        const yesRadio = group.find((r) => {
                                const lbl = (
                                        r.getAttribute('aria-label') ||
                                        r.nextSibling?.textContent ||
                                        ''
                                ).toLowerCase()
                                const matchLabels = entry.hasSkill === false ? ['no', 'false'] : yesLabels
                                return matchLabels.some((y) => lbl.includes(y))
                        })
                        if (yesRadio) yesRadio.click()
                }
        }
}

// ========================
// UTILITIES
// ========================

function showToast(message, type = 'info') {
        try {
                // Remove existing auto-apply toasts
                const existing = document.querySelectorAll('.li-auto-apply-toast')
                existing.forEach(t => { try { t.remove() } catch (e) { } })
                
                const toast = document.createElement('div')
                toast.className = 'li-auto-apply-toast'
                toast.textContent = message
                
                const bgColor = type === 'error' ? '#f87171' : type === 'success' ? '#22c55e' : '#6366f1'
                toast.style.cssText = `
                        position: fixed;
                        top: 24px;
                        right: 24px;
                        background: ${bgColor};
                        color: white;
                        padding: 16px 24px;
                        border-radius: 8px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                        z-index: 999999;
                        font-weight: 600;
                        font-size: 14px;
                        max-width: 400px;
                        animation: slideIn 0.3s ease;
                `
                document.body.appendChild(toast)
                
                setTimeout(() => {
                        try {
                                toast.style.opacity = '0'
                                toast.style.transform = 'translateX(100px)'
                                toast.style.transition = 'all 0.3s ease'
                                setTimeout(() => { try { toast.remove() } catch (e) { } }, 300)
                        } catch (e) { }
                }, 4000)
        } catch (e) {
                console.debug('showToast error', e)
        }
}

function showProgressToast(easyApplyCount, currentJob, totalJobs) {
        try {
                // Update or create progress toast (persistent)
                let toast = document.getElementById('li-auto-apply-progress-toast')
                if (!toast) {
                        toast = document.createElement('div')
                        toast.id = 'li-auto-apply-progress-toast'
                        toast.style.cssText = `
                                position: fixed;
                                bottom: 24px;
                                right: 24px;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                color: white;
                                padding: 14px 20px;
                                border-radius: 8px;
                                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                                z-index: 999998;
                                font-weight: 600;
                                font-size: 15px;
                        `
                        document.body.appendChild(toast)
                }
                
                const percent = totalJobs > 0 ? Math.round((currentJob / totalJobs) * 100) : 0
                toast.textContent = `🎯 Job ${currentJob}/${totalJobs} (${percent}%) | ✅ ${easyApplyCount} Easy Apply`
        } catch (e) {
                console.debug('showProgressToast error', e)
        }
}


function jobCardHasDisqualifier(card) {
        if (!card) return true
        
        // ONLY filter jobs that are explicitly marked as applied
        const hasAppliedStatus = card.querySelector('.job-card-container__footer-item--highlighted, .job-card-container__applied-date, [data-test-job-card-footer-applied]')
        if (hasAppliedStatus) {
                console.log('⏭️ Job card has applied status indicator')
                return true
        }
        
        // Check for "Applied" text in footer specifically (not entire card)
        const footer = card.querySelector('.job-card-container__footer-wrapper, .job-card-list__footer-wrapper')
        if (footer) {
                const footerText = (footer.innerText || '').toLowerCase()
                if (footerText.includes('applied on') || footerText.includes('application sent')) {
                        console.log('⏭️ Job card footer shows already applied')
                        return true
                }
        }
        
        // REMOVED: Checking for expired/closed jobs - let LinkedIn handle this
        // REMOVED: Skipping promoted jobs - these are valid jobs to apply to
        
        return false
}

function getJobIdFromElement(element) {
        if (!element) return null
        
        // Try direct data attributes first
        const directDatasets = [
                element.dataset?.liAutoApplyJobId,
                element.dataset?.jobId,
                element.dataset?.occludableJobId,
                element.dataset?.jobCardId,
                element.getAttribute('data-job-id'),
                element.getAttribute('data-occludable-job-id'),
                element.getAttribute('data-job-card-id'),
                element.getAttribute('data-id'),
                element.getAttribute('data-entity-urn'),
        ]
        for (const value of directDatasets) {
                const normalized = normalizeJobId(value)
                if (normalized) return normalized
        }

        // Try extracting from href (works for collections, search, all layouts)
        const anchors = element.querySelectorAll('a[href*="/jobs/"]')
        for (const anchor of anchors) {
                try {
                        const href = anchor.getAttribute('href') || anchor.href
                        const normalized = extractJobIdFromHref(href)
                        if (normalized) return normalized
                } catch (e) { }
        }

        // Try button data attributes
        const button = element.querySelector('button[data-job-id]')
        if (button) {
                const normalized = normalizeJobId(
                        button.getAttribute('data-job-id') || button.dataset?.jobId,
                )
                if (normalized) return normalized
        }

        return null
}

// Extract job details for history tracking
function getJobDetailsFromCard(jobCard) {
        if (!jobCard) return null
        
        try {
                const jobId = getJobIdFromElement(jobCard)
                if (!jobId) return null
                
                // Extract job title
                let jobTitle = 'Unknown Position'
                const titleSelectors = [
                        '.job-card-list__title',
                        '.job-card-container__link',
                        'a[href*="/jobs/view/"]',
                        '.artdeco-entity-lockup__title',
                        '.job-card-container__metadata-item'
                ]
                for (const selector of titleSelectors) {
                        const titleEl = jobCard.querySelector(selector)
                        if (titleEl && titleEl.textContent.trim()) {
                                jobTitle = titleEl.textContent.trim().split('\n')[0].trim()
                                if (jobTitle && jobTitle.length > 3) break
                        }
                }
                
                // Extract company name
                let company = 'Unknown Company'
                const companySelectors = [
                        '.job-card-container__primary-description',
                        '.artdeco-entity-lockup__subtitle',
                        '.job-card-container__company-name',
                        '[data-anonymize="company-name"]'
                ]
                for (const selector of companySelectors) {
                        const companyEl = jobCard.querySelector(selector)
                        if (companyEl && companyEl.textContent.trim()) {
                                company = companyEl.textContent.trim().split('\n')[0].trim()
                                if (company && company.length > 2) break
                        }
                }
                
                // Extract job link
                let jobLink = `https://www.linkedin.com/jobs/view/${jobId}/`
                const linkEl = jobCard.querySelector('a[href*="/jobs/view/"]')
                if (linkEl) {
                        const href = linkEl.getAttribute('href') || linkEl.href
                        if (href) {
                                try {
                                        const url = new URL(href, window.location.origin)
                                        jobLink = url.href.split('?')[0]
                                } catch (e) {
                                        jobLink = href.split('?')[0]
                                }
                        }
                }
                
                return {
                        jobId,
                        jobTitle,
                        company,
                        jobLink,
                        timestamp: Date.now()
                }
        } catch (e) {
                console.debug('getJobDetailsFromCard error', e)
                return null
        }
}

// Save job to history with error handling and deduplication
async function saveJobToHistory(jobDetails, status) {
        if (!jobDetails || !jobDetails.jobId) return
        
        try {
                const { jobHistory = [] } = await chrome.storage.local.get(['jobHistory'])
                
                // Check if job already exists in history (avoid duplicates)
                const existingIndex = jobHistory.findIndex(j => j.jobId === jobDetails.jobId)
                
                const historyEntry = {
                        ...jobDetails,
                        status,
                        appliedAt: new Date().toISOString()
                }
                
                if (existingIndex >= 0) {
                        // Update existing entry
                        jobHistory[existingIndex] = historyEntry
                } else {
                        // Add new entry at the beginning (newest first)
                        jobHistory.unshift(historyEntry)
                }
                
                // Keep only last 500 jobs to prevent storage bloat
                const trimmedHistory = jobHistory.slice(0, 500)
                
                await chrome.storage.local.set({ jobHistory: trimmedHistory })
                console.log(`💾 Saved to history: ${jobDetails.jobTitle} - ${status}`)
        } catch (e) {
                console.debug('saveJobToHistory error', e)
        }
}

function normalizeJobId(value) {
        if (!value) return null
        const match = String(value).match(/(\d{5,})/)
        return match ? match[1] : null
}

function extractJobIdFromHref(href) {
        if (!href) return null
        try {
                const url = new URL(href, location.origin)
                const directMatch = url.pathname.match(/\/jobs\/view\/(\d+)/)
                if (directMatch) return directMatch[1]
                const currentJobId = url.searchParams.get('currentJobId')
                if (currentJobId) return normalizeJobId(currentJobId)
        } catch (error) {
                const fallbackMatch = href.match(/\/jobs\/view\/(\d+)/)
                if (fallbackMatch) return fallbackMatch[1]
        }
        return null
}

async function openJobCard(card) {
        if (!card) return

        // Verbose debug info to help diagnose why modals sometimes don't open.
        const summarizeEl = (el) => {
                if (!el) return null
                try {
                        return {
                                tag: el.tagName,
                                text: (el.textContent || '').trim().slice(0, 200),
                                aria: el.getAttribute && el.getAttribute('aria-label'),
                                href: el.getAttribute && (el.getAttribute('href') || el.href),
                                dataControl: el.getAttribute && el.getAttribute('data-control-name'),
                                dataTest: !!(el.getAttribute && el.getAttribute('data-test-apply-button')),
                                disabled: !!el.disabled,
                                visible: !!(el.offsetParent || (el.getClientRects && el.getClientRects().length)),
                        }
                } catch (e) { return { tag: el.tagName } }
        }
        const debugInfo = { attempts: [], clicked: null, opened: false, timestamp: Date.now() }
        // Attempt several strategies to open the job details reliably.
        // 1) Click curated target elements inside the card
        for (const selector of JOB_CLICK_TARGET_SELECTORS) {
                const target = card.querySelector(selector)
                if (target) {
                        try {
                                console.debug('openJobCard: clicking target', selector, summarizeEl(target))
                                debugInfo.attempts.push({ selector, found: true, summary: summarizeEl(target) })
                                debugInfo.clicked = { type: 'selector', selector, summary: summarizeEl(target) }
                                triggerClick(target)
                        } catch (e) {
                                console.debug('openJobCard: click failed on target', selector, e)
                                debugInfo.attempts.push({ selector, found: true, error: String(e) })
                        }
                        // wait briefly and check if the apply button / details appeared
                        await randomDelay(250, 500)
                        const appeared = await waitForSelector('button.jobs-apply-button, button[data-test-apply-button], .jobs-easy-apply-modal, [role="dialog"], .jobs-details__main-content, .jobs-search__job-details', 2500)
                        if (appeared) {
                                debugInfo.opened = true
                                debugInfo.openedBy = { method: 'selector', selector }
                                try { window.__li_lastOpenJob = debugInfo } catch (e) { }
                                console.debug('openJobCard: appeared after clicking selector', selector, appeared)
                                return
                        }
                        // otherwise continue to try other targets
                }
        }

        // 2) Try clicking the card itself
        try {
                console.debug('openJobCard: clicking card fallback')
                debugInfo.attempts.push({ selector: 'card', summary: summarizeEl(card) })
                debugInfo.clicked = { type: 'card', summary: summarizeEl(card) }
                triggerClick(card)
        } catch (e) { console.debug('openJobCard: click card failed', e) }
        await randomDelay(300, 600)
        let appeared = await waitForSelector('button.jobs-apply-button, button[data-test-apply-button], .jobs-easy-apply-modal, [role="dialog"], .jobs-details__main-content, .jobs-search__job-details', 2000)
        if (appeared) {
                debugInfo.opened = true
                debugInfo.openedBy = { method: 'card' }
                try { window.__li_lastOpenJob = debugInfo } catch (e) { }
                console.debug('openJobCard: appeared after clicking card', appeared)
                return
        }

        // 3) Try to extract a jobs/view href from anchors and navigate (last resort)
        try {
                const anchor = card.querySelector('a[href*="/jobs/view/"]') || card.querySelector('a')
                if (anchor) {
                        const href = anchor.getAttribute('href') || anchor.href
                        if (href) {
                                console.debug('openJobCard: navigating to job href as fallback', href)
                                debugInfo.attempts.push({ selector: 'anchor-href', href, summary: summarizeEl(anchor) })
                                debugInfo.clicked = { type: 'anchor', href, summary: summarizeEl(anchor) }
                                try {
                                        // Use location.assign so history behaves normally
                                        window.location.assign(href)
                                        // give time for the page to load/apply button to render
                                        const appeared = await waitForSelector('button.jobs-apply-button, button[data-test-apply-button], .jobs-easy-apply-modal, [role="dialog"]', 4000)
                                        if (appeared) {
                                                debugInfo.opened = true
                                                debugInfo.openedBy = { method: 'navigate', href }
                                                try { window.__li_lastOpenJob = debugInfo } catch (e) { }
                                                console.debug('openJobCard: appeared after navigation', appeared)
                                        }
                                } catch (e) {
                                        console.debug('openJobCard: navigation fallback failed', e)
                                }
                                return
                        }
                }
        } catch (e) {
                console.debug('openJobCard: href fallback error', e)
        }

        // If everything failed, log and return — caller will mark job skipped after timeout/attempts
        debugInfo.opened = false
        try { window.__li_lastOpenJob = debugInfo } catch (e) { }
        console.debug('openJobCard: failed to open job details for card', summarizeEl(card), debugInfo)
}

// Wait for the correct job to load in the detail pane by verifying job ID or metadata
async function waitForCorrectJobToLoad(expectedJobId, timeout = 8000) {
        const startTime = Date.now()
        let wrongJobDetections = 0
        let lastWrongJobId = null
        
        while (Date.now() - startTime < timeout) {
                // Check if the detail pane is showing the expected job
                const detailPane = document.querySelector('.jobs-unified-top-card, .jobs-details__main-content, .jobs-search__job-details, .jobs-details')
                if (detailPane) {
                        // Method 1: Check for data-entity-urn or data-job-id attributes
                        const urnElement = detailPane.querySelector('[data-entity-urn*="' + expectedJobId + '"]')
                        if (urnElement) {
                                console.log(`✅ Verified correct job ${expectedJobId} via data-entity-urn`)
                                return expectedJobId
                        }
                        
                        // Method 2: Extract job ID from URLs in detail pane
                        const links = detailPane.querySelectorAll('a[href*="/jobs/view/"]')
                        for (const link of links) {
                                const href = link.getAttribute('href') || link.href
                                const jobId = extractJobIdFromHref(href)
                                if (jobId) {
                                        if (jobId === expectedJobId) {
                                                console.log(`✅ Verified correct job ${expectedJobId} via detail pane link`)
                                                return jobId
                                        } else {
                                                // Detected wrong job - track it
                                                if (jobId !== lastWrongJobId) {
                                                        wrongJobDetections++
                                                        lastWrongJobId = jobId
                                                        console.log(`⚠️ Wrong job detected in detail pane: expected ${expectedJobId}, found ${jobId} (detection #${wrongJobDetections})`)
                                                }
                                                // Abort if wrong job persists
                                                if (wrongJobDetections >= 3) {
                                                        console.log(`❌ Aborting: wrong job ${jobId} persistently loaded instead of ${expectedJobId}`)
                                                        return null
                                                }
                                        }
                                }
                        }
                        
                        // Method 3: Check URL bar if on job details page
                        try {
                                const urlJobId = extractJobIdFromHref(window.location.href)
                                if (urlJobId) {
                                        if (urlJobId === expectedJobId) {
                                                console.log(`✅ Verified correct job ${expectedJobId} from URL`)
                                                return urlJobId
                                        } else {
                                                console.log(`⚠️ Wrong job in URL: expected ${expectedJobId}, found ${urlJobId}`)
                                        }
                                }
                        } catch (e) {}
                        
                        // Method 4: Check for stable DOM element with job ID in attributes
                        const allElements = detailPane.querySelectorAll('[id*="' + expectedJobId + '"], [class*="' + expectedJobId + '"]')
                        if (allElements.length > 0) {
                                console.log(`✅ Verified correct job ${expectedJobId} via DOM attributes`)
                                return expectedJobId
                        }
                }
                
                await randomDelay(400, 600)
        }
        
        console.log(`⚠️ Timeout waiting for job ${expectedJobId} to load in detail pane (waited ${timeout}ms, wrong job detections: ${wrongJobDetections})`)
        return null
}

// Poll for a selector to appear within a timeout (ms). Returns the element or null.
function waitForSelector(selector, timeout = 2000, interval = 300) {
        const end = Date.now() + Math.max(0, timeout)
        return new Promise((resolve) => {
                const check = () => {
                        try {
                                const el = document.querySelector(selector)
                                if (el) return resolve(el)
                                if (Date.now() > end) return resolve(null)
                        } catch (e) {
                                return resolve(null)
                        }
                        setTimeout(check, Math.max(80, interval))
                }
                check()
        })
}

function triggerClick(element) {
        if (!element) return
        try {
                // dispatch a sequence of mouse events for more reliable clicks
                const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
                element.dispatchEvent(down)
                const up = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
                element.dispatchEvent(up)
                const click = new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
                element.dispatchEvent(click)
        } catch (e) {
                try { element.click() } catch (ee) { }
        }
}

// Count easy apply jobs within collected job cards (or page) and show progress
function countEasyApplyJobs() {
        try {
                let count = 0
                // ensure jobCards is populated; if not, collectJobCards may be called first
                const cards = jobCards && jobCards.length ? jobCards : (() => {
                        const collected = []
                        const seenElements = new Set()
                        for (const selector of JOB_CARD_SELECTORS) {
                                const nodes = document.querySelectorAll(selector)
                                if (!nodes?.length) continue
                                nodes.forEach((node) => {
                                        if (seenElements.has(node)) return
                                        seenElements.add(node)
                                        collected.push(node)
                                })
                        }
                        return collected
                })()

                for (const card of cards) {
                        // skip cards that look already applied
                        if (isAlreadyApplied(card)) continue
                        const btn = findEasyApplyButton(card)
                        if (btn) count++
                }
                totalEasyApplyJobs = count
                return count
        } catch (e) {
                console.debug('countEasyApplyJobs error', e)
                totalEasyApplyJobs = 0
                return 0
        }
}

function ensureProgressOverlay() {
        try {
                let el = document.getElementById('li-auto-apply-progress')
                if (!el) {
                        el = document.createElement('div')
                        el.id = 'li-auto-apply-progress'
                        el.style.cssText = 'position:fixed;left:16px;top:16px;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,0.6);color:#fff;z-index:999999;font-weight:700'
                        document.body.appendChild(el)
                }
                return el
        } catch (e) { return null }
}

function updateProgressOverlay(current, total) {
        try {
                const el = ensureProgressOverlay()
                if (!el) return
                el.textContent = `Job ${current} / ${total}`
        } catch (e) { }
}

function removeProgressOverlay() {
        try { const el = document.getElementById('li-auto-apply-progress'); if (el) el.remove() } catch (e) { }
}

function showNoJobsToast(msg = 'No Easy Apply jobs found. Stopping.') {
        try {
                const id = 'li-auto-apply-nojobs'
                let el = document.getElementById(id)
                if (el) try { el.remove() } catch (e) { }
                el = document.createElement('div')
                el.id = id
                el.style.cssText = 'position:fixed;left:50%;top:20%;transform:translateX(-50%);background:#111;color:#fff;padding:12px 16px;border-radius:8px;z-index:999999;box-shadow:0 6px 24px rgba(0,0,0,0.6)'
                el.textContent = msg
                document.body.appendChild(el)
                setTimeout(() => { try { el.remove() } catch (e) { } }, 5000)
        } catch (e) { }
}

function getApplyModal() {
        return document.querySelector('.jobs-easy-apply-modal, [role="dialog"]')
}

function hasBlockingErrors(container) {
        if (!container) return false
        if (container.querySelector('[aria-invalid="true"]')) return true
        if (container.querySelector('.artdeco-inline-feedback--error')) return true
        if (container.querySelector('.artdeco-inline-feedback__message')) return true
        if (document.querySelector('.artdeco-toast-item--error')) return true
        return false
}

function hasUnansweredRequired(container) {
        if (!container) return false
        const selector =
                'input[required], select[required], textarea[required], input[aria-required="true"], select[aria-required="true"], textarea[aria-required="true"]'
        const requiredFields = [...container.querySelectorAll(selector)]
        const checkedRadioGroups = new Set()
        for (const field of requiredFields) {
                if (field.type === 'radio') {
                        if (checkedRadioGroups.has(field.name)) continue
                        checkedRadioGroups.add(field.name)
                        const group = [...container.querySelectorAll('input[type="radio"]')].filter(
                                (radio) => radio.name === field.name,
                        )
                        if (!group.some((radio) => radio.checked)) return true
                        continue
                }
                if (field.type === 'checkbox') {
                        if (!field.checked) return true
                        continue
                }
                if (!field.value) return true
        }
        return false
}

function detectLinkedInLimit() {
        const limitPhrases = [
                'reached the maximum number of job applications',
                'hit a limit',
                'maximum number of linkedin job applications',
                'please wait before applying again',
                'try again later',
        ]
        const toast = document.querySelector('.artdeco-toast-item__message')
        if (toast) {
                const text = toast.textContent.toLowerCase()
                if (limitPhrases.some((phrase) => text.includes(phrase))) return true
        }
        const modal = getApplyModal()
        if (modal) {
                const text = modal.textContent.toLowerCase()
                if (limitPhrases.some((phrase) => text.includes(phrase))) return true
        }
        return false
}

async function handleLinkedInLimit() {
        if (!isRunning || limitNotified) return
        limitNotified = true
        console.warn('⛔ LinkedIn apply limit detected. Stopping automation.')
        isRunning = false
        resolveManualPause('cancel')
        await pushStatsUpdate({ isRunning: false })
        try { cleanupJobUI() } catch (e) { console.debug('cleanupJobUI failed during limit handling:', e) }
        stopContentRunTimer()
        try {
                await chrome.runtime.sendMessage({ action: 'linkedinLimitReached' })
        } catch (error) {
                console.debug('Failed to notify popup about LinkedIn limit:', error)
        }
}

function resolveManualPause(result) {
        if (!manualPauseResolver) return
        const resolver = manualPauseResolver
        manualPauseResolver = null
        resolver(result)
        notifyManualPauseCleared()
}

function notifyManualPauseCleared() {
        try {
                chrome.runtime
                        .sendMessage({ action: 'manualPauseCleared', isRunning })
                        .catch(() => { })
        } catch (error) {
                console.debug('Failed to notify popup that manual pause cleared:', error)
        }
}

function getFieldLabel(el) {
        const aria = el.getAttribute('aria-label') || ''
        const placeholder = el.getAttribute('placeholder') || ''
        const name = el.getAttribute('name') || ''
        const id = el.getAttribute('id') || ''
        const labelEl = el.closest('label, .jobs-easy-apply-form-element')
        const text = labelEl ? labelEl.textContent : ''
        return `${aria} ${placeholder} ${name} ${id} ${text}`.toLowerCase()
}

function setInputValue(el, val) {
        el.value = val
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
}

function findButton(container, texts) {
        return [...container.querySelectorAll('button')].find((btn) =>
                texts.some((t) => btn.textContent.trim().includes(t)),
        )
}

function closeModal() {
        const btn = document.querySelector(
                '.artdeco-modal__dismiss, button[aria-label*="Dismiss"]',
        )
        if (btn) btn.click()
}

async function incrementApplied() {
        const { appliedCount = 0 } = await chrome.storage.local.get(['appliedCount'])
        const newValue = appliedCount + 1
        await chrome.storage.local.set({ appliedCount: newValue })
        await pushStatsUpdate({ isRunning })
}

async function incrementSkipped() {
        const { skippedCount = 0 } = await chrome.storage.local.get(['skippedCount'])
        const newValue = skippedCount + 1
        await chrome.storage.local.set({ skippedCount: newValue })
        await pushStatsUpdate({ isRunning })
}

async function incrementFailed() {
        const { failedCount = 0 } = await chrome.storage.local.get(['failedCount'])
        const newValue = failedCount + 1
        await chrome.storage.local.set({ failedCount: newValue })
        await pushStatsUpdate({ isRunning })
}

function randomDelay(min = delayRange.min, max = delayRange.max) {
        const time = Math.floor(Math.random() * (max - min + 1)) + min
        return new Promise((r) => setTimeout(r, time))
}

// ========================
// Content running-time badge
// ========================
function createContentRunBadge() {
        if (contentRunBadge) return contentRunBadge
        try {
                const badge = document.createElement('div')
                badge.id = 'li-auto-apply-run-timer'
                // circular ring with centered text
                badge.style.cssText = [
                        'position:fixed',
                        'right:16px',
                        'top:80px',
                        'width:56px',
                        'height:56px',
                        'border-radius:50%',
                        'border:6px solid rgba(255,255,255,0.06)',
                        'background:rgba(0,0,0,0.35)',
                        'color:#fff',
                        'display:flex',
                        'align-items:center',
                        'justify-content:center',
                        'font-size:12px',
                        'line-height:1',
                        'text-align:center',
                        'z-index:99999',
                        'box-shadow:0 2px 8px rgba(0,0,0,0.3)'
                ].join(';')
                badge.innerHTML = '<span class="li-run-text" style="pointer-events:none">0m 00s</span>'
                document.body.appendChild(badge)
                contentRunBadge = badge
                return badge
        } catch (e) {
                console.debug('Unable to create content run badge:', e)
                return null
        }
}

function updateContentRunBadge() {
        if (!contentRunBadge) return
        const sec = contentRunElapsed || 0
        const span = contentRunBadge.querySelector('.li-run-text')
        const txt = formatTimer(sec)
        if (span) span.textContent = txt
        else contentRunBadge.textContent = txt
}

function startContentRunTimer() {
        if (contentRunInterval) return
        contentRunElapsed = 0
        const badge = createContentRunBadge()
        updateContentRunBadge()
        contentRunInterval = setInterval(() => {
                contentRunElapsed += 1
                updateContentRunBadge()
        }, 1000)
}

function stopContentRunTimer() {
        try {
                if (contentRunInterval) {
                        clearInterval(contentRunInterval)
                        contentRunInterval = null
                }
                if (contentRunBadge) {
                        contentRunBadge.remove()
                        contentRunBadge = null
                }
                // Stop all per-job timers
                if (window.__liAutoApplyTimers && window.__liAutoApplyTimers.length > 0) {
                        window.__liAutoApplyTimers.forEach(id => {
                                try { clearInterval(id) } catch (e) { }
                        })
                        window.__liAutoApplyTimers = []
                }
                // Remove progress toast
                try {
                        const progressToast = document.getElementById('li-auto-apply-progress-toast')
                        if (progressToast) progressToast.remove()
                } catch (e) { }
        } catch (e) {
                console.debug('Error stopping content run timer:', e)
        }
}
function attachTimerToJob(card, maxSeconds, onTimeout) {
        if (!card) return { clear: () => { } }
        // create either a small ring badge or a textual badge depending on settings
        let badge = card.querySelector('.li-auto-apply__timer')
        if (!badge) {
                badge = document.createElement('div')
                badge.className = 'li-auto-apply__timer'
                try { if (!card.style.position) card.style.position = 'relative' } catch (e) { }
                if (perJobRingTimers) {
                        // place ring on the left to avoid overlapping with status label
                        badge.style.cssText = 'position:absolute;left:8px;top:8px;width:40px;height:40px;border-radius:50%;border:4px solid rgba(102,126,234,0.2);background:rgba(102,126,234,0.9);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;text-align:center;z-index:9999;font-weight:bold'
                        badge.classList.add('ring')
                        badge.innerHTML = '<span class="li-job-text" style="pointer-events:none">0:00</span>'
                } else {
                        // textual badge placed top-left showing elapsed time
                        badge.style.cssText = 'position:absolute;left:8px;top:8px;padding:4px 8px;border-radius:6px;background:rgba(102,126,234,0.95);color:#fff;font-size:12px;z-index:9999;font-weight:600'
                        badge.textContent = '⏱️ 0:00'
                }
                card.appendChild(badge)
        }
        let elapsed = 0
        const id = setInterval(() => {
                elapsed += 1
                // Show elapsed time
                const timeText = formatTimer(elapsed)
                if (perJobRingTimers) {
                        const span = badge.querySelector('.li-job-text')
                        if (span) span.textContent = timeText
                        else badge.textContent = timeText
                } else {
                        badge.textContent = '⏱️ ' + timeText
                }
                // Check timeout
                if (elapsed >= maxSeconds) {
                        clearInterval(id)
                        badge.style.background = 'rgba(239,68,68,0.95)' // Red for timeout
                        setTimeout(() => {
                                try { badge.remove() } catch (e) { }
                        }, 2000)
                        if (typeof onTimeout === 'function') onTimeout()
                        return
                }
        }, 1000)
        // Store in global array so we can stop all timers
        if (!window.__liAutoApplyTimers) window.__liAutoApplyTimers = []
        window.__liAutoApplyTimers.push(id)
        return { 
                clear: () => { 
                        clearInterval(id)
                        try { 
                                badge.remove()
                                // Remove from global array
                                const idx = window.__liAutoApplyTimers?.indexOf(id)
                                if (idx > -1) window.__liAutoApplyTimers.splice(idx, 1)
                        } catch (e) { }
                } 
        }
}

// JOB CARD UI HELPERS: visual label + background for status
function markJobStatus(card, status) {
        if (!card) return
        // ensure position for absolute children
        try { if (!card.style.position) card.style.position = 'relative' } catch (e) { }

        // create or find a small textual label in the top-right
        let statusLabel = card.querySelector('.li-auto-apply-statuslabel')
        if (!statusLabel) {
                statusLabel = document.createElement('div')
                statusLabel.className = 'li-auto-apply-statuslabel'
                // move label to the right to avoid overlap with per-job timer (now on left)
                statusLabel.style.cssText = 'position:absolute;right:8px;top:8px;padding:6px 10px;border-radius:14px;font-size:12px;z-index:99999;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.15);font-weight:600'
                try { card.appendChild(statusLabel) } catch (e) { }
        }

        // clear previous marker classes
        card.classList.remove('li-auto-apply--processing', 'li-auto-apply--applied', 'li-auto-apply--skipped', 'li-auto-apply--stopped')

        if (status === 'processing') {
                card.classList.add('li-auto-apply--processing')
                try {
                        card.style.transition = 'all 300ms ease'
                        card.style.backgroundColor = 'rgba(102, 126, 234, 0.15)'
                        card.style.border = '2px solid rgba(102, 126, 234, 0.6)'
                        card.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.4)'
                        statusLabel.textContent = 'Applying…'
                        statusLabel.style.background = 'linear-gradient(90deg, rgba(102,126,234,0.98), rgba(118,75,162,0.95))'
                        statusLabel.style.color = '#fff'
                        // add pulsing animation
                        statusLabel.classList.add('pulse')
                } catch (e) { }
        } else if (status === 'applied') {
                card.classList.add('li-auto-apply--applied')
                try {
                        card.style.backgroundColor = 'rgba(34, 197, 94, 0.12)'
                        statusLabel.textContent = 'Applied'
                        statusLabel.style.background = 'rgba(34,197,94,0.95)'
                        statusLabel.style.color = '#fff'
                } catch (e) { }
        } else if (status === 'skipped') {
                card.classList.add('li-auto-apply--skipped')
                try {
                        card.style.backgroundColor = 'rgba(107, 114, 128, 0.06)'
                        statusLabel.textContent = 'Skipped'
                        statusLabel.style.background = 'rgba(107,114,128,0.95)'
                        statusLabel.style.color = '#fff'
                        statusLabel.classList.remove('pulse')
                } catch (e) { }
        } else if (status === 'stopped') {
                card.classList.add('li-auto-apply--stopped')
                try {
                        card.style.backgroundColor = 'rgba(239, 68, 68, 0.06)'
                        statusLabel.textContent = 'Stopped'
                        statusLabel.style.background = 'rgba(239,68,68,0.95)'
                        statusLabel.style.color = '#fff'
                        statusLabel.classList.remove('pulse')
                } catch (e) { }
        } else if (status === 'failed') {
                card.classList.add('li-auto-apply--failed')
                try {
                        card.style.backgroundColor = 'rgba(220, 38, 38, 0.06)'
                        statusLabel.textContent = 'Failed'
                        statusLabel.style.background = 'linear-gradient(90deg, rgba(220,38,38,0.95), rgba(185,28,28,0.95))'
                        statusLabel.style.color = '#fff'
                        statusLabel.classList.remove('pulse')
                } catch (e) { }
        } else {
                // unknown/clear: remove label if present
                try { statusLabel.remove() } catch (e) { }
        }
}

function formatSecondsAsMinutes(sec) {
        const m = Math.floor(sec / 60)
        const s = sec % 60
        return `${m}m ${String(s).padStart(2, '0')}s`
}

// Convert existing textual per-job badges to ring style (or vice versa) live
function convertExistingBadges(toRing) {
        try {
                ensureInjectedStyles()
                const badges = document.querySelectorAll('.li-auto-apply__timer')
                badges.forEach((badge) => {
                        try {
                                const txt = (badge.textContent || badge.innerText || '').trim()
                                if (toRing) {
                                        badge.classList.add('ring')
                                        badge.style.cssText = 'position:absolute;left:8px;top:8px;width:40px;height:40px;border-radius:50%;border:4px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;text-align:center;z-index:9999'
                                        // ensure inner span exists for updates
                                        const span = badge.querySelector('.li-job-text') || document.createElement('span')
                                        span.className = 'li-job-text'
                                        span.style.pointerEvents = 'none'
                                        span.textContent = txt || formatTimer(perJobTimeoutSeconds)
                                        badge.innerHTML = ''
                                        badge.appendChild(span)
                                } else {
                                        badge.classList.remove('ring')
                                        badge.style.cssText = 'position:absolute;left:8px;top:8px;padding:4px 6px;border-radius:6px;background:rgba(0,0,0,0.65);color:#fff;font-size:12px;z-index:9999'
                                        // keep human readable text
                                        const span = badge.querySelector('.li-job-text')
                                        badge.textContent = span ? span.textContent : txt
                                }
                        } catch (e) { }
                })
        } catch (e) {
                console.debug('convertExistingBadges error', e)
        }
}

function formatTimer(sec) {
        const s = Math.max(0, Math.floor(sec || 0))
        const m = Math.floor(s / 60)
        const rem = s % 60
        if (compactTimerFormat) {
                if (m === 0) return `${String(rem).padStart(2, '0')}s`
                return `${m}m${String(rem).padStart(2, '0')}s`
        }
        return `${m}m ${String(rem).padStart(2, '0')}s`
}

async function autoScrollJobsList() {
        const listSelectors = [
                '.jobs-search-results-list',
                '.jobs-search__results-list',
                '.jobs-search-results',
                '.jobs-search-two-pane__results-list',
                '.jobs-search-seven-up__list',
                '.jobs-home-jobs-module__list',
                '.jobs-search-vertical__results-list',
        ]
        const lists = listSelectors
                .map((selector) => [...document.querySelectorAll(selector)])
                .flat()
                .filter((el, idx, arr) => el && arr.indexOf(el) === idx)
                .filter((el) => el.scrollHeight > el.clientHeight)

        if (!lists.length) {
                window.scrollBy(0, 800)
                await randomDelay(600, 1000)
                return
        }

        console.log('🔄 Auto-scrolling job list...')
        for (const list of lists) {
                for (let i = 0; i < 8; i++) {
                        list.scrollBy({ top: 800, behavior: 'smooth' })
                        await randomDelay(600, 1100)
                }
        }
}

function getSkillEntries() {
        if (!userData.skills) return []
        if (Array.isArray(userData.skills)) return userData.skills.filter((s) => s && s.name)
        if (typeof userData.skills === 'string') {
                return userData.skills
                        .split(',')
                        .map((name) => name.trim())
                        .filter(Boolean)
                        .map((name) => ({ name, hasSkill: true }))
        }
        return []
}

function getSkillSummary() {
        const entries = getSkillEntries()
        if (!entries.length) return ''
        return entries
                .map((entry) => {
                        const exp = entry.experience ? ` (${entry.experience} yrs)` : ''
                        return `${entry.name}${exp}`
                })
                .join(', ')
}

async function pushStatsUpdate({ isRunning }) {
        const { appliedCount = 0, skippedCount = 0, failedCount = 0 } = await chrome.storage.local.get([
                'appliedCount',
                'skippedCount',
                'failedCount',
        ])
        try {
                await chrome.runtime.sendMessage({
                        action: 'updateStats',
                        applied: appliedCount,
                        skipped: skippedCount,
                        failed: failedCount,
                        isRunning,
                })
        } catch (err) {
                console.debug('Stats update failed:', err)
        }
}

// Ensure helper CSS for badges/animations is injected once
function ensureInjectedStyles() {
        try {
                if (document.getElementById('li-auto-apply-styles')) return
                const css = `
                .pulse { animation: li-auto-pulse 1.1s ease-in-out infinite; }
                @keyframes li-auto-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.03); } 100% { transform: scale(1); } }
                .li-auto-apply-statuslabel { font-family: Arial, Helvetica, sans-serif; }
                .li-auto-apply__timer.ring { box-sizing: border-box; }
                `
                const s = document.createElement('style')
                s.id = 'li-auto-apply-styles'
                s.textContent = css
                        (document.head || document.documentElement).appendChild(s)
        } catch (e) {
                console.debug('ensureInjectedStyles error', e)
        }
}

// Listen for messages from the popup to start/stop/update settings
try {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
                try {
                        if (!msg || !msg.action) return
                        if (msg.action === 'startAutoApply') {
                                userData = msg.userData || userData || {}
                                const settings = msg.settings || {}
                                perJobRingTimers = !!settings.perJobRing
                                compactTimerFormat = !!settings.compactTimer
                                ensureInjectedStyles()
                                convertExistingBadges && convertExistingBadges(perJobRingTimers)
                                if (!isRunning) {
                                        isRunning = true
                                        startContentRunTimer()
                                        // start processing asynchronously so we return quickly
                                        setTimeout(() => {
                                                startProcessing().catch((e) => console.debug('startProcessing error', e))
                                        }, 50)
                                }
                                try { sendResponse && sendResponse({ status: 'started' }) } catch (e) { }
                                return
                        }
                        if (msg.action === 'stopAutoApply') {
                                isRunning = false
                                try { cleanupJobUI() } catch (e) { }
                                stopContentRunTimer()
                                pushStatsUpdate({ isRunning: false }).catch(() => { })
                                try { sendResponse && sendResponse({ status: 'stopped' }) } catch (e) { }
                                return
                        }
                        if (msg.action === 'updateSettings') {
                                const s = msg.settings || {}
                                perJobRingTimers = !!s.perJobRing
                                compactTimerFormat = !!s.compactTimer
                                ensureInjectedStyles()
                                convertExistingBadges && convertExistingBadges(perJobRingTimers)
                                try { sendResponse && sendResponse({ status: 'ok' }) } catch (e) { }
                                return
                        }
                        if (msg.action === 'resumeProcessing' || msg.action === 'manualResume') {
                                console.log('▶️ Resuming auto-apply from manual pause')
                                resolveManualPause('resume')
                                try { sendResponse && sendResponse({ status: 'resumed' }) } catch (e) { }
                                return
                        }
                        if (msg.action === 'skipJob') {
                                console.log('⏭️ Skipping current job from manual pause')
                                resolveManualPause('skip')
                                try { sendResponse && sendResponse({ status: 'skipped' }) } catch (e) { }
                                return
                        }
                        if (msg.action === 'pauseAutoApply') {
                                console.log('⏸️ Pausing auto-apply')
                                isRunning = false
                                try { sendResponse && sendResponse({ status: 'paused' }) } catch (e) { }
                                return
                        }
                } catch (e) {
                        console.debug('content onMessage handler error', e)
                }
        })
} catch (e) {
        console.debug('Failed to attach chrome.runtime.onMessage listener:', e)
}
