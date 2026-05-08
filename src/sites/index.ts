export {
  BRIDGE_SOURCE,
  type BridgeMessage,
  type BridgeMessageType,
  generateSessionId,
  isBridgeMessage,
} from './bridge-protocol';
export { detectSite, isRutube, isYouTube } from './detect';
export {
  bootstrapRutubeSite,
  type RutubeSiteHandle,
} from './rutube';
export {
  bootstrapYouTubeSite,
  type YouTubeSiteHandle,
} from './youtube';
