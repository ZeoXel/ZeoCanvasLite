import type { SubjectImage } from '../../../types/index.ts';

export type SubjectImageAppendError = 'duplicate' | 'limit';

const generateDraftSubjectImageId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `simg_${timestamp}_${random}`;
};

const normalizeSource = (source: string | null | undefined): string => {
  return typeof source === 'string' ? source.trim() : '';
};

export const uniqueNonEmptyImageSources = (sources: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  sources.forEach((item) => {
    const source = normalizeSource(item);
    if (!source || seen.has(source)) return;
    seen.add(source);
    result.push(source);
  });

  return result;
};

export const createDraftSubjectImage = (source: string): SubjectImage => {
  const isRemoteUrl = source.startsWith('http://') || source.startsWith('https://');

  if (isRemoteUrl) {
    return {
      id: generateDraftSubjectImageId(),
      url: source,
      originalUrl: source,
      createdAt: Date.now(),
    };
  }

  return {
    id: generateDraftSubjectImageId(),
    base64: source,
    originalBase64: source,
    createdAt: Date.now(),
  };
};

const getComparableSources = (image: SubjectImage): string[] => {
  const candidates = [
    image.url,
    image.originalUrl,
    image.base64,
    image.originalBase64,
  ];

  return uniqueNonEmptyImageSources(candidates as string[]);
};

export const hasImageSource = (images: SubjectImage[], source: string): boolean => {
  const normalizedSource = normalizeSource(source);
  if (!normalizedSource) return false;

  return images.some((image) => getComparableSources(image).includes(normalizedSource));
};

export const seedSubjectImages = (
  existingImages: SubjectImage[],
  initialImage: string | null | undefined,
  createImage: (source: string) => SubjectImage = createDraftSubjectImage
): SubjectImage[] => {
  const source = normalizeSource(initialImage);
  if (!source) return existingImages;
  if (hasImageSource(existingImages, source)) return existingImages;
  return [createImage(source), ...existingImages];
};

export const tryAppendSubjectImage = (
  images: SubjectImage[],
  source: string,
  createImage: (source: string) => SubjectImage = createDraftSubjectImage,
  maxImages = 3
): { images: SubjectImage[]; error?: SubjectImageAppendError } => {
  const normalizedSource = normalizeSource(source);
  if (!normalizedSource) {
    return { images };
  }

  if (hasImageSource(images, normalizedSource)) {
    return { images, error: 'duplicate' };
  }

  if (images.length >= maxImages) {
    return { images, error: 'limit' };
  }

  return {
    images: [...images, createImage(normalizedSource)],
  };
};
