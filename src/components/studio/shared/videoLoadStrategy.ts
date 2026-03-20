/**
 * Decide whether the cropper should fetch the video as blob.
 * For normal public URLs, prefer direct playback and avoid extra fetch.
 */
export const shouldFetchVideoAsBlob = (src?: string | null): boolean => {
  if (!src) return false;
  if (src.startsWith('data:') || src.startsWith('blob:')) return false;
  if (!src.startsWith('http')) return false;
  try {
    const hostname = new URL(src).hostname;
    const isVolcLike =
      hostname.includes('tos-cn-beijing.volces.com') ||
      hostname.includes('volccdn.com') ||
      hostname.includes('bytecdn.cn') ||
      hostname.includes('volces.com') ||
      hostname.includes('prod-ss-vidu') ||
      hostname.includes('amazonaws.com.cn');
    return (
      isVolcLike ||
      hostname.includes('aliyuncs.com') ||
      hostname.includes('your-cos-domain.com') ||
      hostname.includes('myqcloud.com')
    );
  } catch {
    return false;
  }
};

export const getFrameProxyUrl = (src: string): string =>
  `/api/studio/proxy?url=${encodeURIComponent(src)}`;
