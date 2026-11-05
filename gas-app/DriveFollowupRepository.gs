/**
 * @file DriveFollowupRepository.gs
 * @description Read-only Drive access for Doc action items in Triage. Uses the Advanced Drive service at
 * v3 (userSymbol DriveV3, drive.readonly): files.list with the undocumented followup:actionitems search
 * operator, and comments.list (v3 only; v2 lacks assigneeEmailAddress). Never resolves or edits a comment.
 * Comment text is returned to in-process callers only and is never logged or persisted.
 *
 * Wrapped in an IIFE per .agents/rules/gas-namespace-iife.md; the only export is DPDriveFollowupRepo.
 */
'use strict';

(function(global) {

const FOLLOWUP_QUERY_ = "fullText contains 'followup:actionitems' and trashed = false";
const FOLLOWUP_PAGE_SIZE_ = 100;
const FOLLOWUP_PAGE_CAP_ = 5;
const COMMENT_PAGE_SIZE_ = 100;
const COMMENT_PAGE_CAP_ = 5;
const FILE_ID_RE_ = /^[A-Za-z0-9_-]{10,128}$/;
const FILE_FIELDS_ = 'nextPageToken,files(id,name,mimeType,modifiedTime)';
const COMMENT_FIELDS_ = 'nextPageToken,comments(id,resolved,deleted,assigneeEmailAddress,author(displayName),quotedFileContent/value,content,modifiedTime)';

/**
 * @returns {void}
 * @throws {Error} When the DriveV3 advanced service is not enabled.
 */
function requireService_() {
  if (typeof DriveV3 === 'undefined') throw new Error('Advanced Drive v3 service (DriveV3) is not enabled');
}

/**
 * @param {string} q Drive search query (code constant, never user input).
 * @returns {Array<{id:string,name:string,mimeType:string,modifiedTime:string}>} Matching files.
 */
function listFiles_(q) {
  requireService_();
  const out = [];
  let pageToken;
  for (let page = 0; page < FOLLOWUP_PAGE_CAP_; page++) {
    const res = DriveV3.Files.list({
      q: q,
      pageSize: FOLLOWUP_PAGE_SIZE_,
      pageToken: pageToken,
      corpora: 'allDrives',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      orderBy: 'modifiedTime desc',
      fields: FILE_FIELDS_
    });
    ((res && res.files) || []).forEach(function(f) { out.push(f); });
    pageToken = res && res.nextPageToken;
    if (!pageToken) return out;
  }
  console.error('DriveFollowupRepo: more than ' + (FOLLOWUP_PAGE_SIZE_ * FOLLOWUP_PAGE_CAP_) + ' files matched followup:actionitems; the truncated count is a lower bound');
  return out;
}

/**
 * Files Drive itself lists under Action items for the signed-in user.
 * @returns {Array<{id:string,name:string,mimeType:string,modifiedTime:string}>} Up to 500 files, newest first (the caller caps the fan-out).
 */
function listFollowupFiles() {
  return listFiles_(FOLLOWUP_QUERY_);
}

/**
 * Canary for the undocumented operator: a known-bogus value must return an empty list (200), not an
 * error. If Google ever rejects or ignores the operator this fails loud.
 * @returns {{actionItemsCount:number, bogusCount:number}} Counts; bogusCount must be 0.
 */
function canary() {
  const actionItems = listFiles_(FOLLOWUP_QUERY_);
  const bogus = listFiles_("fullText contains 'followup:dpcanarybogus' and trashed = false");
  if (bogus.length !== 0) throw new Error('followup: operator canary failed: unknown value returned ' + bogus.length + ' files');
  return { actionItemsCount: actionItems.length, bogusCount: bogus.length };
}

/**
 * @param {string} fileId Drive file id.
 * @returns {Array<object>} Comments (bounded to 5 pages of 100).
 * @throws {Error} On a bad id or a Drive failure.
 */
function listComments(fileId) {
  requireService_();
  if (typeof fileId !== 'string' || !FILE_ID_RE_.test(fileId)) throw new Error('Invalid Drive file id');
  const out = [];
  let pageToken;
  for (let page = 0; page < COMMENT_PAGE_CAP_; page++) {
    const res = DriveV3.Comments.list(fileId, {
      pageSize: COMMENT_PAGE_SIZE_,
      includeDeleted: false,
      pageToken: pageToken,
      fields: COMMENT_FIELDS_
    });
    (res.comments || []).forEach(function(c) { out.push(c); });
    pageToken = res.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/**
 * @param {string} fileId Drive file id.
 * @returns {{id:string,name:string,mimeType:string}} Trusted file metadata (title and type for the Task link).
 * @throws {Error} On a bad id or a Drive failure.
 */
function getFile(fileId) {
  requireService_();
  if (typeof fileId !== 'string' || !FILE_ID_RE_.test(fileId)) throw new Error('Invalid Drive file id');
  return DriveV3.Files.get(fileId, { supportsAllDrives: true, fields: 'id,name,mimeType' });
}

global.DPDriveFollowupRepo = Object.freeze({
  getFile: getFile,
  listFollowupFiles: listFollowupFiles,
  listComments: listComments,
  canary: canary
});   // cross-file only: HubController.gs

})(typeof globalThis !== 'undefined' ? globalThis : this);
