export function computeOverlayTransform(
  scrollTop: number = 0,
  scrollLeft: number = 0
): { transform: string } | undefined {
  if (!scrollTop && !scrollLeft) return undefined;
  return {
    transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
  };
}
