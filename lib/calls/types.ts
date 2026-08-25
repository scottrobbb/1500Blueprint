export type WeeklyCallStatus = "draft" | "published" | "cancelled";

export type WeeklyCall = {
  id: string;
  title: string;
  description: string | null;
  focusTopic: string | null;
  hostName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  meetingUrl: string | null;
  recordingUrl: string | null;
  googleEventId: string | null;
  googleCalendarUrl: string | null;
  status: WeeklyCallStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type WeeklyCallInput = Pick<
  WeeklyCall,
  "title" | "description" | "focusTopic" | "hostName" | "startsAt" | "endsAt" | "timezone" | "meetingUrl" | "recordingUrl" | "status"
>;
