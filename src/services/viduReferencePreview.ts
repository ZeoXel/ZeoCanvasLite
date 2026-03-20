export interface ViduUpstreamAsset {
  id: string;
  type: 'image' | 'video';
  src: string;
}

export interface ViduSubjectPreviewSource {
  subjectId: string;
  imageUrls: string[];
}

export interface ViduReferencePreviewAsset {
  id: string;
  type: 'image';
  src: string;
}

export const MAX_VIDU_REFERENCE_IMAGES = 7;

function mergeReferenceImages(
  upstreamImages: string[] = [],
  subjects: ViduSubjectPreviewSource[] = []
): string[] {
  const ordered = [
    ...upstreamImages.filter(Boolean),
    ...subjects.flatMap((subject) => subject.imageUrls || []).filter(Boolean),
  ];
  return Array.from(new Set(ordered)).slice(0, MAX_VIDU_REFERENCE_IMAGES);
}

export interface ViduReferenceUsage {
  mergedImages: string[];
  totalUniqueImages: number;
  overflowCount: number;
  isCapped: boolean;
}

/**
 * Analyze merged reference image usage with the same ordering/dedupe rule.
 * Keeps provider request format unchanged; used for UI display and guards.
 */
export function analyzeViduReferenceImages(
  upstreamImages: string[] = [],
  subjects: ViduSubjectPreviewSource[] = []
): ViduReferenceUsage {
  const ordered = [
    ...upstreamImages.filter(Boolean),
    ...subjects.flatMap((subject) => subject.imageUrls || []).filter(Boolean),
  ];
  const unique = Array.from(new Set(ordered));
  const mergedImages = unique.slice(0, MAX_VIDU_REFERENCE_IMAGES);
  const overflowCount = Math.max(0, unique.length - MAX_VIDU_REFERENCE_IMAGES);
  return {
    mergedImages,
    totalUniqueImages: unique.length,
    overflowCount,
    isCapped: overflowCount > 0,
  };
}

/**
 * Build preview assets using the same merge order as vidu reference requests:
 * upstream images first, then subject images, deduplicated and capped by provider limit.
 */
export function buildViduReferencePreviewAssets(
  upstreamAssets: ViduUpstreamAsset[] = [],
  subjects: ViduSubjectPreviewSource[] = []
): ViduReferencePreviewAsset[] {
  const upstreamImages = upstreamAssets
    .filter((asset) => asset.type === 'image' && asset.src)
    .map((asset) => asset.src);

  const merged = mergeReferenceImages(upstreamImages, subjects);

  const srcToAsset = new Map<string, ViduReferencePreviewAsset>();

  for (const upstreamAsset of upstreamAssets) {
    if (upstreamAsset.type !== 'image' || !upstreamAsset.src) continue;
    if (!srcToAsset.has(upstreamAsset.src)) {
      srcToAsset.set(upstreamAsset.src, {
        id: `up-${upstreamAsset.id}`,
        type: 'image',
        src: upstreamAsset.src,
      });
    }
  }

  for (const subject of subjects) {
    subject.imageUrls.forEach((src, index) => {
      if (!src || srcToAsset.has(src)) return;
      srcToAsset.set(src, {
        id: `subject-${subject.subjectId}-${index}`,
        type: 'image',
        src,
      });
    });
  }

  return merged.map((src, index) => srcToAsset.get(src) || {
    id: `merged-${index}`,
    type: 'image',
    src,
  });
}
