import { AppNode, NodeType } from '@/types';

export type PricingFeatureKey =
  | 'image_generate'
  | 'video_generate'
  | 'video_factory'
  | 'video_multiframe'
  | 'image_3d_camera'
  | 'audio_music'
  | 'audio_voice';

export interface PricingInputAsset {
  type: 'image' | 'video';
  src: string;
}

export interface NodePricingContext {
  featureKey: PricingFeatureKey | null;
  params: Record<string, string>;
}

const toOnOff = (value: boolean): string => (value ? 'on' : 'off');
const toYesNo = (value: boolean): string => (value ? 'yes' : 'no');

const inferVideoGenerationMode = (
  node: AppNode,
  inputAssets: PricingInputAsset[]
): 'text2video' | 'img2video' | 'start-end' | 'reference' => {
  const videoModeOverride = (node.data.videoModeOverride || 'auto') as
    | 'auto'
    | 'text2video'
    | 'img2video'
    | 'start-end'
    | 'reference';
  const isViduModel = (node.data.model || '').startsWith('vidu');
  const hasSelectedSubjects = isViduModel && (node.data.selectedSubjects?.length || 0) > 0;
  const hasFirstLastFrameData = Boolean(
    node.data.firstLastFrameData?.firstFrame && node.data.firstLastFrameData?.lastFrame
  );
  const imageInputCount = inputAssets.filter((asset) => asset.type === 'image').length;
  const hasTwoImageInputs = imageInputCount === 2;
  const shouldPreferViduReference =
    isViduModel && !hasSelectedSubjects && !hasFirstLastFrameData && imageInputCount > 2;
  // Keep mode inference aligned with Node panel: any upstream asset implies non-text mode.
  const hasInputAsset = inputAssets.length > 0 || Boolean(node.data.image);

  if (videoModeOverride !== 'auto') {
    if (videoModeOverride === 'start-end' && !(hasFirstLastFrameData || hasTwoImageInputs)) {
      return hasInputAsset ? 'img2video' : 'text2video';
    }
    if (videoModeOverride === 'reference' && !hasInputAsset) {
      return 'text2video';
    }
    if (videoModeOverride === 'img2video' && !hasInputAsset) {
      return 'text2video';
    }
    return videoModeOverride;
  }

  if (hasSelectedSubjects) return 'reference';
  if (shouldPreferViduReference) return 'reference';
  if (hasFirstLastFrameData || hasTwoImageInputs) return 'start-end';
  if (hasInputAsset) return 'img2video';
  return 'text2video';
};

const getFrameCountBucket = (frameCount: number): '2-3' | '4-6' | '7+' => {
  if (frameCount <= 3) return '2-3';
  if (frameCount <= 6) return '4-6';
  return '7+';
};

const getDurationBucket = (totalDuration: number): 'short' | 'medium' | 'long' => {
  if (totalDuration <= 8) return 'short';
  if (totalDuration <= 20) return 'medium';
  return 'long';
};

export function buildNodePricingContext(
  node: AppNode,
  inputAssets: PricingInputAsset[] = []
): NodePricingContext {
  switch (node.type) {
    case NodeType.IMAGE_GENERATOR: {
      const hasReference =
        inputAssets.some((asset) => asset.type === 'image') || Boolean(node.data.image);

      return {
        featureKey: 'image_generate',
        params: {
          model: node.data.model || 'default',
          aspectRatio: node.data.aspectRatio || 'default',
          imageCount: String(node.data.imageCount || 1),
          hasReference: toYesNo(hasReference),
        },
      };
    }

    case NodeType.VIDEO_GENERATOR:
    case NodeType.VIDEO_FACTORY: {
      const inferredMode = inferVideoGenerationMode(node, inputAssets);
      const hasReference =
        inputAssets.length > 0 ||
        Boolean(node.data.image) ||
        Boolean(node.data.firstLastFrameData?.firstFrame) ||
        Boolean(node.data.firstLastFrameData?.lastFrame);

      return {
        featureKey: node.type === NodeType.VIDEO_GENERATOR ? 'video_generate' : 'video_factory',
        params: {
          model: node.data.model || 'default',
          resolution: node.data.resolution || '720p',
          duration: String(node.data.duration ?? 5),
          generationMode: inferredMode,
          hasReference: toYesNo(hasReference),
          hasSubjectRef: toYesNo((node.data.model || '').startsWith('vidu') && (node.data.selectedSubjects?.length || 0) > 0),
          serviceTier: node.data.videoConfig?.service_tier || 'default',
          bgm: toOnOff(Boolean(node.data.videoConfig?.bgm)),
          audio: toOnOff(Boolean(node.data.videoConfig?.audio)),
          generateAudio: toOnOff(node.data.videoConfig?.generate_audio !== false),
        },
      };
    }

    case NodeType.MULTI_FRAME_VIDEO: {
      const frames = node.data.multiFrameData?.frames || [];
      const totalDuration = Math.max(
        1,
        frames.slice(0, -1).reduce((sum, frame) => sum + (frame.transition?.duration || 4), 0)
      );
      const frameCount = Math.max(2, frames.length || 2);

      return {
        featureKey: 'video_multiframe',
        params: {
          model: node.data.multiFrameData?.viduModel || 'viduq2-turbo',
          resolution: node.data.multiFrameData?.viduResolution || '720p',
          frameCountBucket: getFrameCountBucket(frameCount),
          durationBucket: getDurationBucket(totalDuration),
        },
      };
    }

    case NodeType.IMAGE_3D_CAMERA:
      return {
        featureKey: 'image_3d_camera',
        params: {
          model: node.data.model || 'default',
          aspectRatio: node.data.aspectRatio || '1:1',
        },
      };

    case NodeType.AUDIO_GENERATOR:
      return {
        featureKey: 'audio_music',
        params: {
          mv: node.data.musicConfig?.mv || 'chirp-v4',
          instrumental: toOnOff(Boolean(node.data.musicConfig?.instrumental)),
        },
      };

    case NodeType.VOICE_GENERATOR:
      return {
        featureKey: 'audio_voice',
        params: {
          model: node.data.model || 'speech-2.6-hd',
          soundEffect: node.data.voiceConfig?.voiceModify?.soundEffect || 'none',
        },
      };

    default:
      return {
        featureKey: null,
        params: {},
      };
  }
}
