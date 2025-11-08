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

