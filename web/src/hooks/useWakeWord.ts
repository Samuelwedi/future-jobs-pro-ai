import { useEffect, useRef, useCallback } from 'react';
import { Porcupine, BuiltInKeyword } from '@picovoice/porcupine-web';

export function useWakeWord(onWake: () => void) {
  const detectorRef = useRef<any>(null);

  useEffect(() => {
    let porcupine: any = null;

    const init = async () => {
      try {
        // Use the built-in "Porcupine" wake word (free)
        const pvKey = process.env.REACT_APP_PICOVOICE_ACCESS_KEY || ''; // add your key in .env
        porcupine = await Porcupine.create(
          pvKey,
          [BuiltInKeyword.Porcupine],
          (keyword) => {
            onWake();
          }
        );
        detectorRef.current = porcupine;

        await porcupine.start();
      } catch (err) {
        console.error('Wake word init failed:', err);
      }
    };

    init();

    return () => {
      if (porcupine) {
        porcupine.stop();
        porcupine.release();
      }
    };
  }, [onWake]);

  return detectorRef;
}