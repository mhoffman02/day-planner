/**
 * Franklin Planner Calendar & Schedule Engine
 * Handles 07:00 AM - 07:00 PM schedule grid, event slot mapping, modal popups, and 7x5 monthly calendar calculations.
 */

/**
 * Generates 24 time slot entries for 07:00 AM to 07:00 PM (30-min intervals)
 */
export function generateScheduleGrid() {
  const slots = [];
  const startHour = 7;
  const endHour = 19; // 7:00 PM

  for (let hour = startHour; hour < endHour; hour++) {
    const formattedHourStr = hour > 12 ? `${hour - 12}` : `${hour}`;
    const ampm = hour >= 12 ? 'PM' : 'AM';

    // 00 slot
    slots.push({
      timeKey: `${hour.toString().padStart(2, '0')}:00`,
      displayTime: `${formattedHourStr}:00 ${ampm}`,
      isHalfHour: false,
      events: []
    });

    // 30 slot
    slots.push({
      timeKey: `${hour.toString().padStart(2, '0')}:30`,
      displayTime: `${formattedHourStr}:30 ${ampm}`,
      isHalfHour: true,
      events: []
    });
  }

  // Final 07:00 PM slot marker
  slots.push({
    timeKey: '19:00',
    displayTime: '7:00 PM',
    isHalfHour: false,
    events: []
  });

  return slots;
}

/**
 * Maps raw calendar events onto the schedule grid slots
 */
export function mapEventsToGrid(gridSlots = [], events = []) {
  const grid = gridSlots.map(slot => ({ ...slot, events: [] }));

  events.forEach(evt => {
    const start = new Date(evt.startTime);
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const slotMin = startMin < 30 ? '00' : '30';
    const targetKey = `${startHour.toString().padStart(2, '0')}:${slotMin}`;

    const matchingSlot = grid.find(s => s.timeKey === targetKey);
    if (matchingSlot) {
      matchingSlot.events.push(formatEventModalPayload(evt));
    }
  });

  return grid;
}

/**
 * Formats event object for the interactive gMeet & gCal popup modal
 */
export function formatEventModalPayload(rawEvent = {}) {
  const startTime = rawEvent.startTime ? new Date(rawEvent.startTime) : null;
  const endTime = rawEvent.endTime ? new Date(rawEvent.endTime) : null;

  const timeString = startTime && endTime
    ? `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'All Day';

  return {
    id: rawEvent.id || `evt_${Math.random().toString(36).substr(2, 6)}`,
    title: rawEvent.title || 'Untitled Event',
    formattedTime: timeString,
    startTime: rawEvent.startTime,
    endTime: rawEvent.endTime,
    location: rawEvent.location || '',
    description: rawEvent.description || '',
    meetLink: rawEvent.meetLink || rawEvent.hangoutLink || null,
    gCalLink: rawEvent.htmlLink || `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(rawEvent.title || '')}`,
    attendees: rawEvent.attendees || []
  };
}

/**
 * Generates monthly calendar grid matrix for a given year & month (1-indexed month)
 */
export function generateMonthlyCalendarGrid(year, month, events = []) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const totalDays = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon...

  const days = [];

  // Padding days from previous month
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    days.push({
      dateStr: '',
      dayNumber: prevMonthLastDay - i,
      isCurrentMonth: false,
      events: []
    });
  }

  // Days of current month
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const dayEvents = events.filter(e => {
      const eDate = e.startTime ? new Date(e.startTime).toISOString().slice(0, 10) : '';
      return eDate === dateStr;
    });

    days.push({
      dateStr,
      dayNumber: day,
      isCurrentMonth: true,
      events: dayEvents
    });
  }

  // Trailing padding days to fill 35 or 42 grid cells
  const remainingCells = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    days.push({
      dateStr: '',
      dayNumber: i,
      isCurrentMonth: false,
      events: []
    });
  }

  return days;
}
