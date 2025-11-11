chrome.runtime.onInstalled.addListener(async () => {
        try {
                await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        } catch (error) {
                console.warn('Unable to configure side panel behavior:', error)
        }
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (!changeInfo.status || changeInfo.status !== 'complete') return
        if (!tab.url) return

        const isLinkedInJobs = /^https:\/\/www\.linkedin\.com\/jobs\//.test(tab.url)

        try {
                await chrome.sidePanel.setOptions({
                        tabId,
                        path: 'popup.html',
                        enabled: isLinkedInJobs,
                })
        } catch (error) {
                console.warn('Failed to set side panel options:', error)
        }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getPlacePredictions') {
                handlePlacePredictions(request.query)
                        .then(sendResponse)
                        .catch(error => {
                                console.error('Place prediction error:', error)
                                sendResponse({ success: false, error: error.message })
                        })
                return true
        }
})

async function handlePlacePredictions(query) {
        const GOOGLE_PLACES_API_KEY = 'AIzaSyDummyKeyForPlaceholder'
        
        try {
                const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=(cities)&key=${GOOGLE_PLACES_API_KEY}`
                
                const response = await fetch(url)
                const data = await response.json()
                
                if (data.status === 'OK' && data.predictions) {
                        return {
                                success: true,
                                predictions: data.predictions
                        }
                } else if (data.status === 'REQUEST_DENIED') {
                        return {
                                success: false,
                                error: 'Google Places API key required. Please add a valid API key in background.js'
                        }
                } else if (data.status === 'ZERO_RESULTS') {
                        return {
                                success: true,
                                predictions: []
                        }
                } else {
                        return {
                                success: false,
                                error: `Google Places API error: ${data.status}`
                        }
                }
        } catch (error) {
                throw new Error(`Failed to fetch places: ${error.message}`)
        }
}

