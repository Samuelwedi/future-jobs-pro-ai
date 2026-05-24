import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

export async function registerForPushNotifications(userId: string): Promise<string | undefined> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log('📱 Push token:', token);

  await api.post('/notifications/register', {
    userId,
    token,
    deviceType: Platform.OS,
  });

  return token;
}