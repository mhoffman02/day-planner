/**
 * @file dayDocView.js
 * @description Builds the deep link to one day of the monthly notes Doc for the Open Notes in Docs anchor.
 */

/**
 * Deep link to the day heading in the Doc. Heading ids change on every app save, so build this from a fresh read and
 * never store it.
 * @param {string} docUrl The Doc edit URL.
 * @param {object|null} headingEl The day heading structural element.
 * @returns {string} The URL with #heading=<id>, or docUrl when the heading has no id.
 */
export function dayDocHeadingLink(docUrl, headingEl) {
  const id = headingEl && headingEl.paragraph && headingEl.paragraph.paragraphStyle && headingEl.paragraph.paragraphStyle.headingId;
  return id ? `${docUrl}#heading=${id}` : docUrl;
}
