// Shared Storage settings for the session recordings.
//
// The bucket is PRIVATE (not publicly readable). The access rules live in
// supabase/stage-5-storage.sql. Uploads are authorized by a one-time signed link
// the server mints with the service-role key, and reads (playback) are gatekept
// by the server too, so the browser never holds the service-role key.

// The Storage bucket that holds the webcam recordings.
export const SESSION_VIDEOS_BUCKET = "session-videos";

// Every recording is stored at <student-user-id>/<session-id>.webm, so the first
// folder of the path is the owning student's id. The access rule keys off that
// first folder, which is how a student can reach only their own videos.
export function sessionVideoPath(studentId: string, sessionId: string): string {
  return `${studentId}/${sessionId}.webm`;
}
