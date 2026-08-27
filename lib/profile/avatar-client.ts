type AvatarResponse = { url?: string; error?: string };

export async function uploadProfileAvatar(blob: Blob): Promise<string> {
  const body = new FormData();
  body.append("file", blob, "avatar.jpg");

  const response = await fetch("/api/profile/avatar", {
    method: "POST",
    body,
  });
  const payload = (await response.json().catch(() => null)) as AvatarResponse | null;
  if (!response.ok || !payload?.url) {
    throw new Error("Upload failed. Use a PNG, JPG, GIF, or WebP image under 5 MB.");
  }
  return payload.url;
}

export async function removeProfileAvatar(): Promise<void> {
  const response = await fetch("/api/profile/avatar", { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Could not remove your photo. Please try again.");
  }
}
