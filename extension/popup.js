document.addEventListener('DOMContentLoaded', async () => {
        const startBtn = document.getElementById('startBtn')
        const startBtnLabel = startBtn?.querySelector('.btn__label')
        const stopBtn = document.getElementById('stopBtn')
        const saveSettingsBtn = document.getElementById('saveSettings')
        const skillsContainer = document.getElementById('skillsContainer')
        const addSkillBtn = document.getElementById('addSkillBtn')

        const statusBadge = document.getElementById('statusBadge')
        const statusText = document.getElementById('statusText')
        const statusHint = document.getElementById('statusHint')

        const appliedCountEl = document.getElementById('appliedCount')
        const skippedCountEl = document.getElementById('skippedCount')
        const runTimerEl = document.getElementById('runTimer')
        const resetBtn = document.getElementById('resetBtn')

        const countdownContainer = document.getElementById('countdownContainer')
        const countdownRing = document.getElementById('countdownRing')
        const countdownValueEl = document.getElementById('countdownValue')
        const countdownLabelEl = document.getElementById('countdownLabel')

        // new settings toggles
        const compactTimerToggle = document.getElementById('compactTimerToggle')
        const perJobRingToggle = document.getElementById('perJobRingToggle')
        const resumeNowBtn = document.getElementById('resumeNowBtn')
        const pauseBtn = document.getElementById('pauseBtn')

        const profileInputs = Array.from(
                document.querySelectorAll('.form-section input, .form-section select'),
        )

        const requiredFieldIds = ['fullName', 'email', 'phone']

        const STATUS_CONFIG = {
                inactive: {
                        badge: 'Inactive',
                        className: 'inactive',
                        title: 'Ready to start',
                        hint: 'Fill your profile and start auto apply.',
                        buttonLabel: 'Start Auto Apply',
                },
                running: {
                        badge: 'Running',
                        className: 'running',
                        title: 'Auto applying…',
                        hint: 'Sit tight while Easy Apply completes.',
                        buttonLabel: 'Auto Applying…',
                },
                paused: {
                        badge: 'Paused',
                        className: 'paused',
                        title: 'Waiting for you',
                        hint: 'Finish the LinkedIn form or resume when ready.',
                        buttonLabel: 'Auto Applying…',
                },
                limit: {
                        badge: 'Limit Reached',
                        className: 'limit',
                        title: 'LinkedIn limit reached',
                        hint: 'LinkedIn is limiting applications. Please wait and try again later.',
                        buttonLabel: 'Start Auto Apply',
                },
        }

        const COUNTDOWN_LABEL_DEFAULT = 'sec'
        const DEFAULT_COUNTDOWN_HINT = 'Finish the LinkedIn form to keep things moving.'

        let userData = {}
        let activeJobTabId = null
        let runElapsedSeconds = 0
        let runTimerInterval = null
        let countdownInterval = null
        let countdownRemaining = 0
        let countdownTotal = 0
        let currentState = 'inactive'
        let formDirty = false
        let formValid = false
        let profileSaved = false

        resumeNowBtn.disabled = true
        pauseBtn.disabled = true
        updateCountdownState('idle')
        updateCountdownDisplay()
        updateStatusUI('inactive')

        profileInputs.forEach((input) => {
                input.addEventListener('input', handleFormFieldInput)
                input.addEventListener('change', handleFormFieldInput)
        })

        saveSettingsBtn.disabled = true
        startBtn.disabled = true

        chrome.storage.sync.get('userData', (data) => {
                userData = data.userData || {}
                fillForm(userData)
                initializeFormState(userData)
        })

        // initialize settings toggles from local storage
        chrome.storage.local.get({ compactTimer: false, perJobRing: false }, (res) => {
                if (compactTimerToggle) compactTimerToggle.checked = !!res.compactTimer
                if (perJobRingToggle) perJobRingToggle.checked = !!res.perJobRing
        })

        // send settings to content script when toggles change
        if (compactTimerToggle) {
                compactTimerToggle.addEventListener('change', async () => {
                        await chrome.storage.local.set({ compactTimer: compactTimerToggle.checked })
                        sendSettingsToContent({ compactTimer: compactTimerToggle.checked })
                })
        }
        if (perJobRingToggle) {
                perJobRingToggle.addEventListener('change', async () => {
                        await chrome.storage.local.set({ perJobRing: perJobRingToggle.checked })
                        sendSettingsToContent({ perJobRing: perJobRingToggle.checked })
                })
        }

        await hydrateStats()
        updateRunTimerDisplay()

        chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== 'local') return
                if (changes.appliedCount) {
                        appliedCountEl.textContent = changes.appliedCount.newValue ?? 0
                }
                if (changes.skippedCount) {
                        skippedCountEl.textContent = changes.skippedCount.newValue ?? 0
                }
        })

        saveSettingsBtn.addEventListener('click', async () => {
                const data = collectFormData()
                if (!validateUserData(data, { showAlert: true })) return
                await chrome.storage.sync.set({ userData: data })
                userData = data
                profileSaved = true
                formDirty = false
                formValid = true
                applyValidationStyles([], { show: false })
                updateSaveButtonState()
                updateActionButtons()
                alert('✅ Profile saved successfully!')
        })

        addSkillBtn.addEventListener('click', () => addSkillRow(undefined, { silent: false }))

        // Reset button: clear stats and profile after confirmation
        if (resetBtn) {
                resetBtn.addEventListener('click', async () => {
                        if (!confirm('Reset extension? This will clear counts and saved profile.')) return
                        // stop any running process
                        await stopAutoApply()
                        try {
                                await new Promise((resolve) => chrome.storage.local.set({ appliedCount: 0, skippedCount: 0 }, resolve))
                        } catch (e) {
                                console.debug('Failed to reset local stats:', e)
                        }
                        // remove saved profile
                        try {
                                await new Promise((resolve) => chrome.storage.sync.remove('userData', resolve))
                        } catch (e) {
                                console.debug('Failed to remove userData from sync storage:', e)
                                // fallback: set empty userData
                                try {
                                        await new Promise((resolve) => chrome.storage.sync.set({ userData: {} }, resolve))
                                } catch (err) { }
                        }
                        appliedCountEl.textContent = 0
                        skippedCountEl.textContent = 0
                        runElapsedSeconds = 0
                        updateRunTimerDisplay()
                        fillForm({})
                        initializeFormState({})
                        alert('✅ Extension reset complete')
                })
        }

        startBtn.addEventListener('click', async () => {
                if (!profileSaved) {
                        const data = collectFormData()
                        const valid = validateUserData(data, { showAlert: true })
                        if (valid) {
                                alert('ℹ️ Please save your profile before starting auto apply.')
                        }
                        return
                }

                const data = collectFormData()
                if (!validateUserData(data, { showAlert: true })) return
                userData = data
                await chrome.storage.sync.set({ userData })

                // Find all LinkedIn Jobs tabs in the current window and broadcast Start
                let tabs = []
                try {
                        const allTabs = await chrome.tabs.query({ currentWindow: true })
                        tabs = allTabs.filter((t) => isValidLinkedInTab(t))
                } catch (e) {
                        console.debug('Failed to query tabs for start:', e)
                }
                if (!tabs.length) {
                        alert('⚠️ Please open at least one LinkedIn job search tab before starting.')
                        return
                }
                activeJobTabId = tabs[0].id

                // Do not reset stats automatically when starting. User's counts should persist.
                updateStatusUI('running')

                try {
                        // include current settings when starting
                        const settings = await new Promise((resolve) =>
                                chrome.storage.local.get({ compactTimer: false, perJobRing: false }, resolve),
                        )
                        console.debug('Popup: broadcasting startAutoApply to', tabs.length, 'tabs', { settings })
                        for (const t of tabs) {
                                try {
                                        await chrome.tabs.sendMessage(t.id, {
                                                action: 'startAutoApply',
                                                userData,
                                                settings,
                                        })
                                } catch (err) {
                                        console.debug('Failed to send start to tab', t.id, err)
                                }
                        }
                } catch (error) {
                        console.error('Failed to broadcast start to content scripts:', error)
                        updateStatusUI('inactive')
                        alert(
                                '⚠️ Unable to start. Make sure a LinkedIn jobs tab is open and refreshed.',
                        )
                }
        })

        stopBtn.addEventListener('click', () => stopAutoApply())
        resumeNowBtn.addEventListener('click', () => resumeAutoApply(false))
        pauseBtn.addEventListener('click', () => pauseAutoApply())

        chrome.runtime.onMessage.addListener((request, sender) => {
                if (sender?.tab?.id) activeJobTabId = sender.tab.id
                switch (request.action) {
                        case 'updateStats':
                                if (typeof request.applied === 'number') {
                                        appliedCountEl.textContent = request.applied
                                }
                                if (typeof request.skipped === 'number') {
                                        skippedCountEl.textContent = request.skipped
                                }
                                if (
                                        (currentState !== 'paused' || !request.isRunning) &&
                                        !(currentState === 'limit' && request.isRunning)
                                ) {
                                        updateStatusUI(request.isRunning ? 'running' : 'inactive')
                                }
                                break
                        case 'manualPause':
                                updateStatusUI('paused')
                                startCountdown(request.seconds || 15, request.reason)
                                break
                        case 'manualPauseCleared':
                                clearCountdown()
                                if (typeof request.isRunning === 'boolean') {
                                        updateStatusUI(request.isRunning ? 'running' : 'inactive')
                                } else if (currentState === 'paused') {
                                        updateStatusUI('running')
                                }
                                break
                        case 'linkedinLimitReached':
                                clearCountdown()
                                updateStatusUI('limit')
                                alert(
                                        '⚠️ LinkedIn reports you have reached an apply limit. Please wait before continuing.',
                                )
                                break
                }
        })

        async function sendSettingsToContent(settings) {
                // Broadcast settings to all LinkedIn Jobs tabs in the current window
                try {
                        const allTabs = await chrome.tabs.query({ currentWindow: true })
                        const target = allTabs.filter((t) => isValidLinkedInTab(t))
                        for (const t of target) {
                                try {
                                        await chrome.tabs.sendMessage(t.id, { action: 'updateSettings', settings })
                                } catch (err) {
                                        console.debug('Failed to send settings to tab', t.id, err)
                                }
                        }
                } catch (err) {
                        console.debug('Failed to broadcast settings to content scripts:', err)
                }
        }

        function fillForm(data) {
                document.getElementById('fullName').value = data.fullName || ''
                document.getElementById('email').value = data.email || ''
                document.getElementById('phone').value = data.phone || ''
                document.getElementById('location').value = data.location || ''
                document.getElementById('linkedinProfile').value = data.linkedinProfile || ''
                document.getElementById('yearsExperience').value = data.yearsExperience || ''
                document.getElementById('currentCompany').value = data.currentCompany || ''
                document.getElementById('currentTitle').value = data.currentTitle || ''
                document.getElementById('noticePeriod').value = data.noticePeriod || ''
                document.getElementById('workAuthorization').value =
                        data.workAuthorization || ''

                skillsContainer.innerHTML = ''
                        ; (data.skills || []).forEach((skill) => addSkillRow(skill))
        }

        function collectFormData() {
                const skills = Array.from(
                        skillsContainer.querySelectorAll('.skill-row'),
                )
                        .map((row) => ({
                                name: row.querySelector('.skill-name').value.trim(),
                                hasSkill: row.querySelector('.skill-yes').checked,
                                experience: row.querySelector('.skill-exp').value.trim() || '0',
                        }))
                        .filter((skill) => skill.name)
                return {
                        fullName: document.getElementById('fullName').value.trim(),
                        email: document.getElementById('email').value.trim(),
                        phone: document.getElementById('phone').value.trim(),
                        location: document.getElementById('location').value.trim(),
                        linkedinProfile: document.getElementById('linkedinProfile').value.trim(),
                        yearsExperience: document.getElementById('yearsExperience').value.trim(),
                        currentCompany: document.getElementById('currentCompany').value.trim(),
                        currentTitle: document.getElementById('currentTitle').value.trim(),
                        noticePeriod: document.getElementById('noticePeriod').value.trim(),
                        workAuthorization: document
                                .getElementById('workAuthorization')
                                .value.trim(),
                        skills,
                }
        }

        // Run timer is managed via updateStatusUI which controls start/stop based on currentState.
        // (Removed stray reference to undefined `state` which caused a ReferenceError.)

        function validateUserData(data, options = {}) {
                // options: { showAlert: boolean }
                const requiredFields = ['fullName', 'email', 'phone']
                const missing = requiredFields.filter((f) => !data[f])
                if (missing.length) {
                        if (options.showAlert) {
                                alert(`⚠️ Please fill required fields: ${missing.join(', ')}`)
                        }
                        return false
                }
                if (!data.skills || !data.skills.length) {
                        if (options.showAlert) {
                                alert('⚠️ Please add at least one skill before starting auto apply.')
                        }
                        return false
                }
                return true
        }

        function applyValidationStyles(missingFields = [], options = {}) {
                // Add/remove a simple 'invalid' class for required inputs
                const fields = ['fullName', 'email', 'phone']
                fields.forEach((id) => {
                        const el = document.getElementById(id)
                        if (!el) return
                        if (missingFields.includes(id)) el.classList.add('invalid')
                        else el.classList.remove('invalid')
                })
                if (options.show === false) {
                        // remove all invalid indicators
                        fields.forEach((id) => {
                                const el = document.getElementById(id)
                                if (el) el.classList.remove('invalid')
                        })
                }
        }

        function updateSaveButtonState() {
                // Enable save when the form is dirty and required fields are present
                try {
                        const data = collectFormData()
                        const hadRequired = ['fullName', 'email', 'phone'].every((f) => !!data[f])
                        saveSettingsBtn.disabled = !(formDirty && hadRequired)
                } catch (e) {
                        saveSettingsBtn.disabled = true
                }
        }

        function updateActionButtons() {
                // Start button should be enabled only when profileSaved is true and not running
                if (!startBtn) return
                if (currentState === 'running') {
                        startBtn.disabled = true
                        stopBtn.disabled = false
                } else {
                        startBtn.disabled = !profileSaved
                        stopBtn.disabled = true
                }
        }

        function initializeFormState(data) {
                // Set initial flags based on stored data
                profileSaved = !!(data && Object.keys(data).length)
                formDirty = false
                formValid = profileSaved && validateUserData(data, { showAlert: false })
                applyValidationStyles([], { show: false })
                updateSaveButtonState()
                updateActionButtons()
        }

        function handleFormFieldInput(e) {
                // mark form as dirty and disable profileSaved until saved
                formDirty = true
                profileSaved = false
                // update UI affordances
                updateSaveButtonState()
                updateActionButtons()
                // remove validation hints while editing
                applyValidationStyles([], { show: false })
        }

        function addSkillRow(skill = { name: '', hasSkill: true, experience: '' }, options = {}) {
                // options: { silent: boolean } - when true, don't mark form dirty
                const row = document.createElement('div')
                row.className = 'skill-row'

                const nameInput = document.createElement('input')
                nameInput.type = 'text'
                nameInput.className = 'skill-name'
                nameInput.placeholder = 'Skill (e.g., React)'
                nameInput.value = skill.name || ''

                const toggleLabel = document.createElement('label')
                toggleLabel.className = 'skill-toggle'
                const toggleInput = document.createElement('input')
                toggleInput.type = 'checkbox'
                toggleInput.className = 'skill-yes'
                toggleInput.checked = skill.hasSkill !== false
                const toggleText = document.createElement('span')
                toggleText.textContent = 'Have Skill'
                toggleLabel.append(toggleInput, toggleText)

                const experienceInput = document.createElement('input')
                experienceInput.type = 'number'
                experienceInput.className = 'skill-exp'
                experienceInput.placeholder = 'Years'
                experienceInput.min = '0'
                experienceInput.value = skill.experience || '0'

                const removeBtn = document.createElement('button')
                removeBtn.type = 'button'
                removeBtn.className = 'remove-skill'
                removeBtn.textContent = '✕'
                removeBtn.setAttribute('aria-label', 'Remove skill')
                removeBtn.addEventListener('click', () => {
                        row.remove()
                        // mark dirty and update buttons
                        formDirty = true
                        profileSaved = false
                        updateSaveButtonState()
                        updateActionButtons()
                })

                // Attach listeners so editing a newly added skill marks form dirty
                nameInput.addEventListener('input', handleFormFieldInput)
                toggleInput.addEventListener('change', handleFormFieldInput)
                experienceInput.addEventListener('input', handleFormFieldInput)

                row.append(nameInput, toggleLabel, experienceInput, removeBtn)
                skillsContainer.appendChild(row)

                if (!options.silent) {
                        formDirty = true
                        profileSaved = false
                        updateSaveButtonState()
                        updateActionButtons()
                        // focus the new skill input for convenience
                        nameInput.focus()
                }
        }

        function updateStatusUI(state, overrides = {}) {
                if (currentState === 'paused' && state === 'running' && countdownInterval)
                        return
                currentState = state
                const config = STATUS_CONFIG[state] || STATUS_CONFIG.inactive
                const badgeText = overrides.badge || config.badge
                const statusClass = `status-pill status-pill--${config.className}`
                const hint = overrides.hint || config.hint
                const title = overrides.title || config.title
                const buttonLabel = overrides.buttonLabel || config.buttonLabel

                if (statusBadge) {
                        statusBadge.textContent = badgeText
                        statusBadge.className = statusClass
                }
                if (statusText) statusText.textContent = title
                setStatusHint(hint)

                switch (state) {
                        case 'running':
                                startBtn.disabled = true
                                stopBtn.disabled = false
                                setButtonLoading(true, buttonLabel)
                                resumeNowBtn.disabled = true
                                pauseBtn.disabled = true
                                break
                        case 'paused':
                                startBtn.disabled = true
                                stopBtn.disabled = false
                                setButtonLoading(true, buttonLabel)
                                break
                        case 'limit':
                                startBtn.disabled = false
                                stopBtn.disabled = true
                                setButtonLoading(false)
                                resumeNowBtn.disabled = true
                                pauseBtn.disabled = true
                                break
                        default:
                                startBtn.disabled = false
                                stopBtn.disabled = true
                                setButtonLoading(false)
                                resumeNowBtn.disabled = true
                                pauseBtn.disabled = true
                }

                // Manage run timer: run only while in 'running' state
                if (state === 'running') startRunTimer()
                else stopRunTimer()
        }

        // Running time helpers
        function formatSecsToMinSec(sec) {
                if (typeof sec !== 'number' || Number.isNaN(sec)) return '--'
                const m = Math.floor(sec / 60)
                const s = sec % 60
                if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
                return `${s}s`
        }

        function startRunTimer() {
                if (!runTimerEl) return
                if (runTimerInterval) return // already running
                runTimerInterval = setInterval(() => {
                        runElapsedSeconds += 1
                        updateRunTimerDisplay()
                }, 1000)
                updateRunTimerDisplay()
        }

        function stopRunTimer() {
                if (runTimerInterval) {
                        clearInterval(runTimerInterval)
                        runTimerInterval = null
                }
        }

        function updateRunTimerDisplay() {
                if (!runTimerEl) return
                runTimerEl.textContent = formatSecsToMinSec(runElapsedSeconds)
        }

        function setButtonLoading(isLoading, labelText = 'Auto Applying…') {
                if (!startBtn) return
                if (isLoading) {
                        startBtn.classList.add('btn--loading')
                        if (startBtnLabel) startBtnLabel.textContent = labelText
                        else startBtn.textContent = labelText
                } else {
                        startBtn.classList.remove('btn--loading')
                        if (startBtnLabel) startBtnLabel.textContent = 'Start Auto Apply'
                        else startBtn.textContent = 'Start Auto Apply'
                }
        }

        function setStatusHint(message) {
                if (!statusHint) return
                statusHint.textContent = message
        }

        function startCountdown(seconds, reason) {
                clearCountdown({ keepHint: true })
                countdownTotal = Math.max(1, Math.round(seconds))
                countdownRemaining = countdownTotal
                updateCountdownState('counting')
                updateCountdownDisplay()
                setStatusHint(getCountdownHint(reason))
                resumeNowBtn.disabled = false
                pauseBtn.disabled = false
                if (countdownContainer) countdownContainer.classList.add('is-active')

                countdownInterval = setInterval(() => {
                        countdownRemaining -= 1
                        if (countdownRemaining <= 0) {
                                clearCountdown()
                                resumeAutoApply(true)
                                return
                        }
                        updateCountdownDisplay()
                }, 1000)
        }

        function pauseAutoApply() {
                if (currentState !== 'paused') return
                // Stop the countdown interval to prevent auto-resume
                cancelCountdownInterval()
                updateCountdownState('paused')
                // Keep displaying the remaining time
                updateCountdownDisplay()
                resumeNowBtn.disabled = false
                pauseBtn.disabled = true
                setStatusHint('Auto apply paused. Resume when ready.')
        }

        function clearCountdown(options = {}) {
                cancelCountdownInterval()
                countdownTotal = 0
                countdownRemaining = 0
                updateCountdownState('idle')
                if (!options.skipDisplayReset) updateCountdownDisplay()
                resumeNowBtn.disabled = true
                pauseBtn.disabled = true
                if (countdownRing) countdownRing.style.setProperty('--ring-progress', '0')
                if (countdownContainer) countdownContainer.classList.remove('is-active')
                if (!options.keepHint) {
                        const config = STATUS_CONFIG[currentState] || STATUS_CONFIG.inactive
                        setStatusHint(config.hint)
                }
        }

        function cancelCountdownInterval() {
                if (countdownInterval) {
                        clearInterval(countdownInterval)
                        countdownInterval = null
                }
        }

        function updateCountdownState(state) {
                if (countdownRing) countdownRing.dataset.state = state
        }

        function updateCountdownDisplay() {
                if (!countdownValueEl || !countdownLabelEl) return
                if (countdownRing?.dataset.state === 'paused') {
                        // Show timer text even when paused
                        const mins = Math.floor(countdownRemaining / 60)
                        const secs = countdownRemaining % 60
                        countdownValueEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`
                        countdownLabelEl.textContent = 'paused'
                        return
                }
                if (!countdownTotal || countdownRemaining <= 0) {
                        countdownValueEl.textContent = '--'
                        countdownLabelEl.textContent = COUNTDOWN_LABEL_DEFAULT
                        if (countdownRing) countdownRing.style.setProperty('--ring-progress', '0')
                        return
                }
                countdownValueEl.textContent = countdownRemaining
                countdownLabelEl.textContent = COUNTDOWN_LABEL_DEFAULT
                const degrees = Math.max(
                        0,
                        Math.min(360, (countdownRemaining / countdownTotal) * 360),
                )
                if (countdownRing)
                        countdownRing.style.setProperty('--ring-progress', degrees.toFixed(2))
        }

        function getCountdownHint(reason) {
                switch (reason) {
                        case 'formIncomplete':
                                return 'Finish missing answers in the LinkedIn form.'
                        default:
                                return DEFAULT_COUNTDOWN_HINT
                }
        }

        async function stopAutoApply() {
                clearCountdown()
                updateStatusUI('inactive')
                // send stop to all LinkedIn Jobs tabs so they all cleanup
                try {
                        const allTabs = await chrome.tabs.query({ currentWindow: true })
                        const target = allTabs.filter((t) => isValidLinkedInTab(t))
                        for (const t of target) {
                                try {
                                        await chrome.tabs.sendMessage(t.id, { action: 'stopAutoApply' })
                                } catch (err) {
                                        console.debug('Failed to send stop to tab', t.id, err)
                                }
                        }
                } catch (err) {
                        console.debug('Failed to broadcast stop:', err)
                }
                // also reset popup run timer
                runElapsedSeconds = 0
                updateRunTimerDisplay()
        }

        async function resumeAutoApply(autoTriggered) {
                clearCountdown()
                updateStatusUI('running')
                const tab = await getJobTab()
                if (!tab) return
                try {
                        await chrome.tabs.sendMessage(tab.id, {
                                action: 'manualResume',
                                autoTriggered: Boolean(autoTriggered),
                        })
                } catch (error) {
                        console.warn('Unable to send resume message:', error)
                }
        }

        async function getJobTab() {
                if (activeJobTabId) {
                        try {
                                const tab = await chrome.tabs.get(activeJobTabId)
                                if (tab && isValidLinkedInTab(tab)) return tab
                        } catch (error) {
                                console.debug('Stored tab no longer available:', error)
                        }
                }
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
                if (tab && isValidLinkedInTab(tab)) {
                        activeJobTabId = tab.id
                        return tab
                }
                return null
        }

        async function hydrateStats() {
                const { appliedCount = 0, skippedCount = 0 } = await chrome.storage.local.get([
                        'appliedCount',
                        'skippedCount',
                ])
                appliedCountEl.textContent = appliedCount
                skippedCountEl.textContent = skippedCount
        }

        async function resetStats() {
                await chrome.storage.local.set({ appliedCount: 0, skippedCount: 0 })
                appliedCountEl.textContent = 0
                skippedCountEl.textContent = 0
        }

        function isValidLinkedInTab(tab) {
                if (!tab || !tab.url) return false
                // Accept linkedin jobs pages with or without www and with either http/https
                return /^https?:\/\/(?:www\.)?linkedin\.com\/jobs\//.test(tab.url)
        }
})

