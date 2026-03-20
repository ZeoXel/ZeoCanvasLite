export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const clampCropRect = (
  rect: CropRect,
  boundsWidth: number,
  boundsHeight: number,
  minSize = 1
): CropRect => {
  const maxW = Math.max(minSize, boundsWidth);
  const maxH = Math.max(minSize, boundsHeight);
  const width = clamp(rect.width, minSize, maxW);
  const height = clamp(rect.height, minSize, maxH);
  const x = clamp(rect.x, 0, Math.max(0, boundsWidth - width));
  const y = clamp(rect.y, 0, Math.max(0, boundsHeight - height));
  return { x, y, width, height };
};

const fitToAspect = (maxWidth: number, maxHeight: number, aspectRatio: number) => {
  if (maxWidth <= 0 || maxHeight <= 0 || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { width: 0, height: 0 };
  }

  if (maxWidth / maxHeight > aspectRatio) {
    return {
      width: maxHeight * aspectRatio,
      height: maxHeight,
    };
  }

  return {
    width: maxWidth,
    height: maxWidth / aspectRatio,
  };
};

export const createCenteredCropRect = ({
  boundsWidth,
  boundsHeight,
  aspectRatio,
  coverage = 0.72,
  minSize = 24,
}: {
  boundsWidth: number;
  boundsHeight: number;
  aspectRatio: number | null;
  coverage?: number;
  minSize?: number;
}): CropRect => {
  const safeW = Math.max(1, boundsWidth);
  const safeH = Math.max(1, boundsHeight);
  const targetW = safeW * coverage;
  const targetH = safeH * coverage;

  let width = targetW;
  let height = targetH;

  if (aspectRatio) {
    const fitted = fitToAspect(targetW, targetH, aspectRatio);
    width = fitted.width;
    height = fitted.height;
  }

  const rect = {
    x: (safeW - width) / 2,
    y: (safeH - height) / 2,
    width,
    height,
  };

  return clampCropRect(rect, safeW, safeH, minSize);
};

export const recenterCropRectWithAspect = ({
  rect,
  boundsWidth,
  boundsHeight,
  aspectRatio,
  minSize = 24,
}: {
  rect: CropRect;
  boundsWidth: number;
  boundsHeight: number;
  aspectRatio: number | null;
  minSize?: number;
}): CropRect => {
  const safeW = Math.max(1, boundsWidth);
  const safeH = Math.max(1, boundsHeight);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  if (!aspectRatio) {
    return clampCropRect(rect, safeW, safeH, minSize);
  }

  // Match ImageCropper behavior: keep width first, derive height from ratio.
  let width = rect.width;
  let height = width / aspectRatio;
  if (height > safeH) {
    height = safeH;
    width = height * aspectRatio;
  }
  if (width > safeW) {
    width = safeW;
    height = width / aspectRatio;
  }

  return clampCropRect(
    {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    },
    safeW,
    safeH,
    minSize
  );
};

export const resizeCropRectFromAnchor = ({
  anchorX,
  anchorY,
  currentX,
  currentY,
  boundsWidth,
  boundsHeight,
  aspectRatio,
  minSize = 24,
}: {
  anchorX: number;
  anchorY: number;
  currentX: number;
  currentY: number;
  boundsWidth: number;
  boundsHeight: number;
  aspectRatio: number | null;
  minSize?: number;
}): CropRect => {
  const safeW = Math.max(1, boundsWidth);
  const safeH = Math.max(1, boundsHeight);
  const clampedX = clamp(currentX, 0, safeW);
  const clampedY = clamp(currentY, 0, safeH);
  const dirX = clampedX >= anchorX ? 1 : -1;
  const dirY = clampedY >= anchorY ? 1 : -1;

  let width = Math.max(minSize, Math.abs(clampedX - anchorX));
  let height = Math.max(minSize, Math.abs(clampedY - anchorY));

  if (aspectRatio) {
    if (width / height > aspectRatio) {
      height = width / aspectRatio;
    } else {
      width = height * aspectRatio;
    }
  }

  const maxWidthFromAnchor = dirX === 1 ? safeW - anchorX : anchorX;
  const maxHeightFromAnchor = dirY === 1 ? safeH - anchorY : anchorY;
  const scale = Math.min(
    1,
    maxWidthFromAnchor > 0 ? maxWidthFromAnchor / width : 1,
    maxHeightFromAnchor > 0 ? maxHeightFromAnchor / height : 1
  );

  width *= scale;
  height *= scale;

  if (!aspectRatio) {
    width = Math.max(minSize, width);
    height = Math.max(minSize, height);
  }

  const rect = {
    x: dirX === 1 ? anchorX : anchorX - width,
    y: dirY === 1 ? anchorY : anchorY - height,
    width,
    height,
  };

  return clampCropRect(rect, safeW, safeH, minSize);
};
