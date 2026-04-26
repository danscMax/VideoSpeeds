export { detectSite, isRutube, isYouTube } from './detect';
export {
  bootstrapYouTubeSite,
  type YouTubeSiteHandle,
} from './youtube';
export {
  bootstrapRutubeSite,
  type RutubeSiteHandle,
} from './rutube';
export {
  BRIDGE_SOURCE,
  generateSessionId,
  isBridgeMessage,
  type BridgeMessage,
  type BridgeMessageType,
} from './bridge-protocol';
