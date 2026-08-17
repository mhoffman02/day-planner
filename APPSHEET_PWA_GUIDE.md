# AppSheet Native & PWA Shell Integration Guide

## Overview
Google AppSheet is Google's no-code app development platform that converts Google Sheets into native, installable apps for iOS, Android, and Web/Desktop with full offline synchronization capabilities.

This guide outlines how to wrap the **Day Planner** backend into an AppSheet PWA / Native container.

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   AppSheet Shell App                   │
│   (Installable iOS / Android / Desktop PWA with SW)    │
├────────────────────────────────────────────────────────┤
│ • Offline-First SQLite Sync Engine                     │
│ • Local Cache & Change Queue                           │
│ • Background 2-Way Sync Engine                         │
└───────────────────────────┬────────────────────────────┘
                            │ (Auto Sync)
┌───────────────────────────▼────────────────────────────┐
│              Google Sheets Binder Database              │
│       (`Day Planner Master - [Year]`)                   │
└───────────────────────────┬────────────────────────────┘
                            │ (Apps Script Triggers)
┌───────────────────────────▼────────────────────────────┐
│      Google Apps Script Engine (`gas-app/Code.gs`)      │
│  (2-Way Sync to Google Calendar & Google Tasks APIs)   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Setup Step-by-Step

### Step 1: Prepare Google Sheets Backend
1. In Google Drive, create a Google Spreadsheet titled **`Day Planner Database`**.
2. Create 4 Worksheets inside:
   - **`Tasks`**: `[Id, Date, Title, Status, Category, PriorityGroup, Sequence, SyncId, UpdatedAt]`
   - **`CalendarEvents`**: `[Id, Date, Title, StartTime, EndTime, Location, Description, MeetLink, SyncId]`
   - **`DailyNotes`**: `[Date, Content, Tags, UpdatedAt]`
   - **`IndexRegistry`**: `[Topic, Date, Summary, Category, DocLink]`

### Step 2: Create AppSheet Application
1. Go to [AppSheet.com](https://www.appsheet.com) and log in with your Google account.
2. Click **Create** > **App** > **Start with existing data**.
3. Name the app **Franklin Day Planner** and select your `Day Planner Database` Google Sheet.

### Step 3: Configure Views & UX
1. **Daily 2-Page View**:
   - Create a **Dashboard View** combining `Tasks` (Form / Inline Table), `CalendarEvents` (Detail / Timeline), and `DailyNotes` (Detail / Edit card).
2. **Monthly Calendar**:
   - Add a **Calendar View** type mapped to `CalendarEvents` with start time and end time columns.
3. **Master Tasks**:
   - Add a **Table View** grouped by `Category` and sorted by `PriorityGroup` and `Sequence`.

### Step 4: Enable Offline & PWA Sync Settings
1. In AppSheet Admin, navigate to **Settings** > **Offline & Sync**.
2. Turn ON:
   - **Offline mode**: Store data locally for offline usage.
   - **Sync on start**: Fetch latest workspace changes on app launch.
   - **Automatic background sync**: Sync pending offline changes when connection is restored.

### Step 5: Install App on Mobile & Desktop
1. **iOS / Android**: Open the AppSheet sharing link on your mobile device and tap **Add to Home Screen** or install via the AppSheet container.
2. **Desktop PWA**: Open the app URL in Chrome or Edge and click the **Install App** icon in the address bar.

---

## 3. Benefits of AppSheet Shell for GAS Served App
- **100% Installable**: Installs as a standalone app with desktop shortcut and mobile app icon.
- **True Offline Capability**: Local SQLite database caches all planner entries; queues edits offline and syncs bi-directionally when back online.
- **Native Device Features**: Camera photo attachments for Daily Notes, push notifications for scheduled appointment reminders.
- **Google Workspace Security**: Inherits Google OAuth 2.0 authentication and enterprise access controls.
