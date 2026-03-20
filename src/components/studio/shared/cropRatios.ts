export interface CropAspectRatioOption {
  label: string;
  value: number | null;
}

export const CROP_ASPECT_RATIO_OPTIONS: CropAspectRatioOption[] = [
  { label: '自由', value: null },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '1:1', value: 1 },
];

export const getCropAspectRatioLabel = (value: number | null): string => {
  const option = CROP_ASPECT_RATIO_OPTIONS.find((item) => item.value === value);
  return option?.label || '自由';
};
