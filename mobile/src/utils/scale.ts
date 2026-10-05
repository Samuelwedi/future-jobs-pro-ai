import { Dimensions } from 'react-native';

// Read current dimensions on each call. Use useWindowDimensions in rendering
// components, so resize/rotation triggers a render rather than caching a value.
export const scale = (size: number) => (Dimensions.get('window').width / 375) * size;
export const verticalScale = (size: number) => (Dimensions.get('window').height / 812) * size;
export const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;
