import { calendar_v3 } from "googleapis";

/**
 * Formats a list of events into a user-friendly string.
 */
export function formatEventList(events: calendar_v3.Schema$Event[]): string {
    return events
        .map((event) => {
            const attendeeList = event.attendees
                ? `\nAttendees: ${event.attendees
                    .map((a) => `${a.email || "no-email"} (${a.responseStatus || "unknown"})`)
                    .join(", ")}`
                : "";
            const locationInfo = event.location ? `\nLocation: ${event.location}` : "";
            const descriptionInfo = event.description ? `\nDescription: ${event.description}` : "";
            const colorInfo = event.colorId ? `\nColor ID: ${event.colorId}` : "";
            const reminderInfo = event.reminders
                ? `\nReminders: ${event.reminders.useDefault ? 'Using default' :
                    (event.reminders.overrides || []).map((r: any) => `${r.method} ${r.minutes} minutes before`).join(', ') || 'None'}`
                : "";
            const meetLink = event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri
                ? `\nGoogle Meet: ${event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video')?.uri}`
                : "";
            return `${event.summary || "Untitled"} (${event.id || "no-id"})${locationInfo}${descriptionInfo}\nStart: ${event.start?.dateTime || event.start?.date || "unspecified"}\nEnd: ${event.end?.dateTime || event.end?.date || "unspecified"}${attendeeList}${colorInfo}${reminderInfo}${meetLink}\n`;
        })
        .join("\n");
}
