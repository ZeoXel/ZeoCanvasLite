import { useEffect } from 'react';
import { canvasAPI, CanvasOperations } from '@/services/canvasAPI';

export function useCanvasAPIRegistration(ops: CanvasOperations) {
  useEffect(() => {
    canvasAPI.register(ops);
    return () => canvasAPI.unregister();
  }, [ops]);
}
