/**
 * @file docTabs.js
 * @description One-tab guard for notes Docs. Docs.Documents.get without includeTabsContent returns the first tab only,
 * and writes without a tabId land in the first tab, so a tab added by hand would be silently ignored while the app kept
 * reading and writing tab 1. Readers fetch with includeTabsContent: true and pass the result here; more than one tab
 * (child tabs included) throws, naming the Doc.
 */

function docTabsCount(tabs) {
  return tabs.reduce((n, t) => n + 1 + (Array.isArray(t.childTabs) ? docTabsCount(t.childTabs) : 0), 0);
}

/**
 * @param {object} doc A Docs API document read with includeTabsContent: true.
 * @param {string} docId Doc id, for the error message.
 * @returns {Array<object>} The body content (structural elements) of the single tab.
 * @throws {Error} if the read did not include tabs, or the Doc has more than one tab.
 */
export function docBodyContent(doc, docId) {
  if (!doc || typeof doc !== 'object') throw new Error(`docBodyContent: no Doc was returned for ${docId}`);
  if (!Array.isArray(doc.tabs) || doc.tabs.length === 0) {
    throw new Error(`docBodyContent: ${docId} came back without tabs; read it with includeTabsContent: true so a second tab cannot be missed`);
  }
  const count = docTabsCount(doc.tabs);
  if (count > 1) {
    const err = new Error(`Notes Doc ${docId} has ${count} tabs; the app reads and writes one tab only, so remove the extra tabs in Google Docs`);
    err.code = 'DOC_MULTI_TAB';
    throw err;
  }
  const body = doc.tabs[0].documentTab && doc.tabs[0].documentTab.body;
  return (body && body.content) || [];
}
