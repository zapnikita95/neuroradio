const VK_TOKEN = () => process.env.VK_ACCESS_TOKEN?.trim() ?? '';
const VK_GROUP = () => process.env.VK_GROUP_ID?.trim() ?? '';

export function isVkWallPublishConfigured(): boolean {
  return Boolean(VK_TOKEN() && VK_GROUP());
}

export async function publishToVkWall(message: string): Promise<number | null> {
  const token = VK_TOKEN();
  const groupRaw = VK_GROUP();
  if (!token || !groupRaw) {
    console.warn('[vk-wall] skip — VK_ACCESS_TOKEN or VK_GROUP_ID missing');
    return null;
  }
  const ownerId = groupRaw.startsWith('-') ? groupRaw : `-${groupRaw.replace(/\D/g, '')}`;

  const params = new URLSearchParams({
    owner_id: ownerId,
    from_group: '1',
    message: message.slice(0, 4000),
    access_token: token,
    v: '5.199',
  });

  try {
    const res = await fetch(`https://api.vk.com/method/wall.post?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as {
      response?: { post_id?: number };
      error?: { error_msg?: string; error_code?: number };
    };
    if (data.error) {
      throw new Error(`VK ${data.error.error_code}: ${data.error.error_msg ?? 'unknown'}`);
    }
    return data.response?.post_id ?? null;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }
}
