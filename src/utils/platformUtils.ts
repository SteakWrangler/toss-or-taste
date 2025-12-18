import { Capacitor } from '@capacitor/core';

export const isIOS = () => {
  return Capacitor.getPlatform() === 'ios';
};

export const isAndroid = () => {
  return Capacitor.getPlatform() === 'android';
};

export const isWeb = () => {
  return Capacitor.getPlatform() === 'web';
};

export const isMobile = () => {
  return isIOS() || isAndroid();
};

export const shouldUseApplePayments = () => {
  return isIOS();
};

export const shouldUseGooglePayments = () => {
  return isAndroid();
};

export const shouldUseStripe = () => {
  return isWeb();
};

export const getPlatformName = () => {
  return Capacitor.getPlatform();
};
