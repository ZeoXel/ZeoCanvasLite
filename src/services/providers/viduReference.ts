export interface ViduSubjectReferenceInput {
  images?: string[];
}

export const MAX_VIDU_REFERENCE_IMAGES = 7;

/**
 * 合并参考图顺序：上游输入优先，其次主体图；去重后最多 7 张（Vidu 限制）
 */
export function mergeViduReferenceImages(
  upstreamImages: string[] = [],
  subjects: ViduSubjectReferenceInput[] = []
): string[] {
  const ordered = [
    ...upstreamImages.filter(Boolean),
    ...subjects.flatMap((subject) => subject.images || []).filter(Boolean),
  ];

  return Array.from(new Set(ordered)).slice(0, MAX_VIDU_REFERENCE_IMAGES);
}

