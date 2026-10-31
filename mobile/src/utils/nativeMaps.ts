import Constants from 'expo-constants';
import {Platform} from 'react-native';
// A missing Android manifest API key crashes native MapView before JS can catch it.
export const nativeMapsAvailable = Platform.OS !== 'android' || Constants.appOwnership === 'expo' || Constants.expoConfig?.extra?.androidMapsConfigured === true;
