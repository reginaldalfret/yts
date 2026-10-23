/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {CobaltVideoElement} from 'google3/third_party/javascript/yts/test_utils/cobalt_video_element';
import {requestIndividualization} from 'google3/third_party/javascript/yts/test_utils/eme/eme_utils';
import {setupMse} from 'google3/third_party/javascript/yts/test_utils/mse/setup_mse';
import * as util from 'google3/third_party/javascript/yts/test_utils/playback_util';
import {StreamDef} from 'google3/third_party/javascript/yts/test_utils/streams/interfaces';
import {
  AAC,
  AV1,
  H264,
  VP9,
} from 'google3/third_party/javascript/yts/test_utils/streams/media_streams';

import {
  AV1_LICENSE_URL,
  CONCURRENT_2027_CONFIG,
  ConcurrentPlaybackMonitorOptions,
  DrmMode,
  LICENSE_DELAY_MS,
  VideoCodecType,
  VideoElementSetup,
  VideoStreamConfig,
} from './dual_drm_test_constants';

/** Minimum playback rate ratio required per polling tick. */
const MIN_TICK_PLAYBACK_RATE_RATIO = 0.5;

/** Injects the dual-video Picture-in-Picture layout stylesheet into the DOM. */
export function initializeDualVideoStyle(): void {
  if (document.getElementById('dual-video-style')) {
    return;
  }
  console.log(
    'Initializing dual video container styles: ' +
      '#primary-container z-index=1, #secondary-container z-index=2',
  );
  const style = document.createElement('style');
  style.id = 'dual-video-style';
  style.textContent = `
    #primary-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
    }
    #secondary-container {
      position: absolute;
      bottom: 32px;
      right: 32px;
      width: 320px;
      height: 180px;
      background-color: transparent;
      box-sizing: border-box;
      z-index: 2;
    }
    #primary-container video,
    #secondary-container video {
      width: 100%;
      height: 100%;
    }
  `;
  document.head.appendChild(style);
}

/** Removes any injected dual-video stylesheets from document.head. */
export function cleanUpDualVideoStyle(): void {
  for (const styleId of ['dual-video-style', 'dual-video-legacy-style']) {
    const style = document.getElementById(styleId);
    if (style?.parentNode) {
      style.parentNode.removeChild(style);
    }
  }
}

/** Removes a video element and its parent container from the DOM. */
export function cleanUpVideoAndContainer(
  videoId: string,
  containerId: string,
): void {
  const video = document.getElementById(videoId);
  if (video instanceof HTMLVideoElement) {
    util.removeCobaltVideo(video);
  }

  const container = document.getElementById(containerId);
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
  }
}

/**
 * Polls both video elements over a shared wall-clock window and verifies that
 * both advance simultaneously without stalling.
 */
export async function monitorConcurrentPlayback(
  options: ConcurrentPlaybackMonitorOptions,
): Promise<void> {
  const {
    primaryVideoId,
    secondaryVideoId,
    primaryStartThresholdSec,
    secondaryStartThresholdSec,
    requiredConcurrentSec,
    maxStallSec,
    timeoutSec,
    pollIntervalMs = 0.5 * util.SECOND,
  } = options;

  const startTimeMs = Date.now();
  let hasReachedStartThresholds = false;
  let lastPrimaryTimeSec = -1;
  let lastSecondaryTimeSec = -1;
  let consecutivePrimaryStallMs = 0;
  let consecutiveSecondaryStallMs = 0;
  let accumulatedConcurrentMs = 0;
  let lastCheckTimeMs = Date.now();

  while (Date.now() - startTimeMs < timeoutSec * 1000) {
    await util.sleep(pollIntervalMs);
    const nowMs = Date.now();
    const elapsedSinceLastCheckMs = nowMs - lastCheckTimeMs;
    lastCheckTimeMs = nowMs;

    const primaryElement = document.getElementById(primaryVideoId);
    const secondaryElement = document.getElementById(secondaryVideoId);
    if (
      !(primaryElement instanceof HTMLVideoElement) ||
      !(secondaryElement instanceof HTMLVideoElement)
    ) {
      continue;
    }

    const primaryCurrentSec = primaryElement.currentTime;
    const secondaryCurrentSec = secondaryElement.currentTime;

    // Wait until both videos have initially reached their start thresholds.
    if (!hasReachedStartThresholds) {
      if (
        primaryCurrentSec < primaryStartThresholdSec ||
        secondaryCurrentSec < secondaryStartThresholdSec
      ) {
        continue;
      }
      hasReachedStartThresholds = true;
      lastPrimaryTimeSec = primaryCurrentSec;
      lastSecondaryTimeSec = secondaryCurrentSec;
      continue;
    }

    // Handle loop wraparound on short streams when video.loop = true.
    if (
      primaryCurrentSec < lastPrimaryTimeSec ||
      secondaryCurrentSec < lastSecondaryTimeSec
    ) {
      lastPrimaryTimeSec = primaryCurrentSec;
      lastSecondaryTimeSec = secondaryCurrentSec;
      consecutivePrimaryStallMs = 0;
      consecutiveSecondaryStallMs = 0;
      continue;
    }

    const deltaPrimarySec = primaryCurrentSec - lastPrimaryTimeSec;
    const deltaSecondarySec = secondaryCurrentSec - lastSecondaryTimeSec;
    lastPrimaryTimeSec = primaryCurrentSec;
    lastSecondaryTimeSec = secondaryCurrentSec;

    const minExpectedDeltaSec =
      (elapsedSinceLastCheckMs / 1000) * MIN_TICK_PLAYBACK_RATE_RATIO;
    const primaryAdvancing = deltaPrimarySec >= minExpectedDeltaSec;
    const secondaryAdvancing = deltaSecondarySec >= minExpectedDeltaSec;

    if (primaryAdvancing && secondaryAdvancing) {
      accumulatedConcurrentMs += elapsedSinceLastCheckMs;
      consecutivePrimaryStallMs = 0;
      consecutiveSecondaryStallMs = 0;
    } else if (primaryAdvancing && !secondaryAdvancing) {
      consecutiveSecondaryStallMs += elapsedSinceLastCheckMs;
      consecutivePrimaryStallMs = 0;
      if (consecutiveSecondaryStallMs > maxStallSec * 1000) {
        const stallSec = (consecutiveSecondaryStallMs / 1000).toFixed(1);
        const pTime = primaryCurrentSec.toFixed(2);
        const sTime = secondaryCurrentSec.toFixed(2);
        throw new Error(
          `Concurrent playback failed: secondaryVideo stalled for ` +
            `${stallSec}s while primaryVideo was playing ` +
            `(primary currentTime=${pTime}, secondary currentTime=${sTime}).`,
        );
      }
    } else if (!primaryAdvancing && secondaryAdvancing) {
      consecutivePrimaryStallMs += elapsedSinceLastCheckMs;
      consecutiveSecondaryStallMs = 0;
      if (consecutivePrimaryStallMs > maxStallSec * 1000) {
        const stallSec = (consecutivePrimaryStallMs / 1000).toFixed(1);
        const pTime = primaryCurrentSec.toFixed(2);
        const sTime = secondaryCurrentSec.toFixed(2);
        throw new Error(
          `Concurrent playback failed: primaryVideo stalled for ` +
            `${stallSec}s while secondaryVideo was playing ` +
            `(primary currentTime=${pTime}, secondary currentTime=${sTime}).`,
        );
      }
    } else {
      consecutivePrimaryStallMs += elapsedSinceLastCheckMs;
      consecutiveSecondaryStallMs += elapsedSinceLastCheckMs;
      const maxConsecutiveStallMs = Math.max(
        consecutivePrimaryStallMs,
        consecutiveSecondaryStallMs,
      );
      if (maxConsecutiveStallMs > maxStallSec * 1000) {
        const stallSec = (maxConsecutiveStallMs / 1000).toFixed(1);
        const pTime = primaryCurrentSec.toFixed(2);
        const sTime = secondaryCurrentSec.toFixed(2);
        throw new Error(
          `Concurrent playback failed: both videos stalled for ${stallSec}s ` +
            `(primary currentTime=${pTime}, secondary currentTime=${sTime}).`,
        );
      }
    }

    if (accumulatedConcurrentMs >= requiredConcurrentSec * 1000) {
      const verifiedSec = (accumulatedConcurrentMs / 1000).toFixed(1);
      console.log(`Verified concurrent playback for ${verifiedSec} seconds.`);
      return;
    }
  }

  if (accumulatedConcurrentMs < requiredConcurrentSec * 1000) {
    const accumulatedSec = (accumulatedConcurrentMs / 1000).toFixed(1);
    throw new Error(
      `Concurrent playback verification timed out: only accumulated ` +
        `${accumulatedSec}s of simultaneous playback ` +
        `(required ${requiredConcurrentSec}s).`,
    );
  }
}

/** Resolves the Widevine license server URL for a stream. */
export function getLicenseServerUrl(
  stream: StreamDef,
  defaultUrl?: string,
): string {
  const videoId = stream.get('video_id') as string | undefined;
  const signature = stream.get('widevine_signature') as string | undefined;
  const key = (stream.get('key') as string | undefined) ?? 'test_key1';
  if (videoId && signature) {
    return (
      'https://dash-mse-test.appspot.com/api/drm/widevine?' +
      'drm_system=widevine&source=YOUTUBE&ip=0.0.0.0&ipbits=0' +
      `&expire=19000000000&key=${key}` +
      '&sparams=ip,ipbits,expire,drm_system,source,video_id' +
      `&video_id=${videoId}&signature=${signature}`
    );
  }
  return defaultUrl ?? AV1_LICENSE_URL;
}

/**
 * Configures EME MediaKeys and license acquisition listeners on a video
 * element when DRM is enabled, returning a cleanup callback that closes the
 * MediaKeySession and detaches MediaKeys during test teardown.
 */
export async function setupDrmForVideo(
  video: CobaltVideoElement,
  stream: StreamDef,
  drmMode: DrmMode,
  licenseServerUrl: string,
): Promise<() => Promise<void>> {
  if (drmMode === 'clear') {
    return async () => {};
  }

  const keySystems =
    drmMode === 'hw'
      ? ['com.widevine.alpha']
      : ['com.youtube.widevine.l3', 'com.widevine.alpha'];

  const isWebm = stream.mimetype.includes('webm');
  const initDataTypes = isWebm ? ['webm'] : ['cenc'];
  let mediaKeySystemAccess: MediaKeySystemAccess | undefined;
  let selectedKeySystem = '';

  for (const keySystem of keySystems) {
    try {
      mediaKeySystemAccess = await navigator.requestMediaKeySystemAccess(
        keySystem,
        [
          {
            initDataTypes,
            videoCapabilities: [
              {
                contentType: stream.mimetype,
                ...(isWebm ? {} : {encryptionScheme: 'cenc'}),
              },
            ],
          },
        ],
      );
      selectedKeySystem = keySystem;
      break;
    } catch {
      try {
        mediaKeySystemAccess = await navigator.requestMediaKeySystemAccess(
          keySystem,
          [
            {
              initDataTypes,
              videoCapabilities: [
                {
                  contentType: stream.mimetype,
                },
              ],
            },
          ],
        );
        selectedKeySystem = keySystem;
        break;
      } catch {
        console.log(`requestMediaKeySystemAccess for ${keySystem} failed`);
      }
    }
  }

  if (!mediaKeySystemAccess) {
    throw new Error(
      `Failed to request MediaKeySystemAccess for ${stream.mimetype}`,
    );
  }
  console.log(`Selected key system: ${selectedKeySystem}`);

  const mediaKeys = await mediaKeySystemAccess.createMediaKeys();
  await video.setMediaKeys(mediaKeys);
  const mediaKeySession = mediaKeys.createSession();

  const onMessage = (messageEvent: MediaKeyMessageEvent) => {
    const message = messageEvent.message;
    const messageType = messageEvent.messageType;
    const keySession = messageEvent.target as MediaKeySession;
    const updateSession = (response: Uint8Array) => {
      setTimeout(() => {
        keySession.update(response.buffer).catch(() => {
          console.log('keySession.update failed');
        });
      }, LICENSE_DELAY_MS);
    };
    if (messageType === 'individualization-request') {
      requestIndividualization(message, updateSession);
    } else if (messageType === 'license-request' || !messageType) {
      util.fetchArrayBuffer(
        'POST',
        licenseServerUrl,
        messageEvent.message,
        (licenseArrayBuffer) => {
          mediaKeySession
            .update(util.extractLicenseCallback(licenseArrayBuffer))
            .catch(() => {
              console.log('mediaKeySession.update failed');
            });
        },
      );
    } else {
      console.debug('unknown MediaKeyMessageEvent type');
    }
  };
  mediaKeySession.addEventListener('message', onMessage);

  const onEncrypted = (encryptedEvent: MediaEncryptedEvent) => {
    mediaKeySession
      .generateRequest(
        encryptedEvent.initDataType,
        encryptedEvent.initData as BufferSource,
      )
      .catch(() => {
        console.log('mediaKeySession.generateRequest failed');
      });
  };
  video.addEventListener('encrypted', onEncrypted);

  return async () => {
    video.removeEventListener('encrypted', onEncrypted);
    mediaKeySession.removeEventListener('message', onMessage);
    try {
      await mediaKeySession.close();
    } catch {
      // Ignore session close errors during teardown.
    }
    try {
      await video.setMediaKeys(null);
    } catch {
      // Ignore setMediaKeys(null) errors during teardown.
    }
  };
}

/**
 * Selects the primary video stream based on codec, DRM mode, and device
 * resolution tier (8K -> >=4K stream, 4K -> >=1080p60 stream, <=FHD ->
 * 1080p30/720p30 stream).
 */
export function getPrimaryStream(
  codec: VideoCodecType,
  drm: DrmMode,
  isShorts?: boolean,
): StreamDef {
  const is8kDevice = util.isGreaterThan8K() || util.isGreaterThan4K();
  const is4kDevice = util.isGreaterThanFHDAndSmallerThanOrEqualTo4K();
  const isHighRes = is8kDevice || is4kDevice;

  switch (codec) {
    case 'av1':
      if (drm === 'clear') {
        if (is8kDevice) return AV1['Sdr2160p30'];
        if (is4kDevice) return AV1['Bunny1080p60fps'];
        return MediaSource?.isTypeSupported?.(AV1['Bunny1080p30fps'].mimetype)
          ? AV1['Bunny1080p30fps']
          : AV1['Bunny720p30fps'];
      }
      if (is8kDevice) return AV1['SencSdr2160p30'];
      if (is4kDevice) return AV1['SencSdr1080p60'];
      return MediaSource?.isTypeSupported?.(AV1['SencSdr1080p30'].mimetype)
        ? AV1['SencSdr1080p30']
        : AV1['SencSdr720p30'];

    case 'vp9':
      if (drm === 'clear') {
        if (isShorts) {
          if (is8kDevice) return VP9['Shorts313'];
          if (is4kDevice) return VP9['Shorts248'];
          return VP9['Shorts247'];
        }
        if (is8kDevice) return VP9['Video2160p1MB'];
        if (is4kDevice) return VP9['Video1080p1MB'];
        return VP9['VideoHuge'];
      }
      if (is8kDevice) {
        return VP9['DrmCbcs1080p60fps'];
      }
      if (is4kDevice) {
        return VP9['DrmL3NoHDCP1080p30fpsEnc'];
      }
      return MediaSource?.isTypeSupported?.(
        VP9['DrmL3NoHDCP1080p30fpsEnc'].mimetype,
      )
        ? VP9['DrmL3NoHDCP1080p30fpsEnc']
        : VP9['DrmL3NoHDCP720p30fpsEnc'];

    case 'h264':
    default:
      if (drm === 'clear') {
        if (isShorts) {
          return isHighRes ? H264['Shorts137'] : H264['Shorts136'];
        }
        return isHighRes ? H264['VideoHuge'] : H264['VideoNormal'];
      }
      return isHighRes
        ? H264['DrmL3NoHDCP1080p30fpsCenc']
        : H264['DrmL3NoHDCP720p30fpsCenc'];
  }
}

/**
 * Selects the secondary video stream based on codec, DRM mode, and device
 * resolution tier.
 */
export function getSecondaryStream(
  codec: VideoCodecType,
  drm: DrmMode,
  isShorts?: boolean,
): StreamDef {
  const isHighRes =
    util.isGreaterThan4K() ||
    util.isGreaterThan8K() ||
    util.isGreaterThanFHDAndSmallerThanOrEqualTo4K();

  switch (codec) {
    case 'av1':
      if (drm === 'clear') {
        return isHighRes &&
          MediaSource?.isTypeSupported?.(AV1['Bunny720p30fps'].mimetype)
          ? AV1['Bunny720p30fps']
          : AV1['Bunny480p30fps'];
      }
      return isHighRes &&
        MediaSource?.isTypeSupported?.(AV1['SencSdr720p30'].mimetype)
        ? AV1['SencSdr720p30']
        : AV1['SencSdr480p30'];

    case 'vp9':
      if (drm === 'clear') {
        if (isShorts) {
          return isHighRes ? VP9['Shorts247'] : VP9['Shorts244'];
        }
        return isHighRes ? VP9['VideoNormal'] : VP9['VideoTiny'];
      }
      return isHighRes
        ? VP9['DrmL3NoHDCP720p30fpsEnc']
        : VP9['DrmL3NoHDCP480p30fpsEnc'];

    case 'h264':
    default:
      if (drm === 'clear') {
        if (isShorts) {
          return isHighRes ? H264['Shorts136'] : H264['Shorts135'];
        }
        return isHighRes ? H264['VideoNormal'] : H264['CarMedium'];
      }
      return isHighRes
        ? H264['DrmL3NoHDCP720p30fpsCenc']
        : H264['DrmL3NoHDCP480p30fpsCenc'];
  }
}

/**
 * Creates a DOM video container, initializes EME DRM if required, and starts
 * progressive MSE chunked streaming.
 */
export async function setupVideoElement2027(
  role: 'primary' | 'secondary',
  config: VideoStreamConfig,
): Promise<VideoElementSetup> {
  if (config.codec === 'av1' && !util.supportsAV1()) {
    throw new Error(`AV1 codec is not supported for ${role} video`);
  }

  const drmMode: DrmMode = config.drm ?? 'hw';
  const stream =
    config.stream ??
    (role === 'primary'
      ? getPrimaryStream(config.codec, drmMode, config.isShorts)
      : getSecondaryStream(config.codec, drmMode, config.isShorts));

  if (!MediaSource?.isTypeSupported?.(stream.mimetype)) {
    throw new Error(
      `Unsupported MIME type for ${role} video: ${stream.mimetype}`,
    );
  }

  const container = document.createElement('div');
  container.id = `${role}-container`;
  document.body.appendChild(container);

  const video = document.createElement('video') as CobaltVideoElement;
  container.appendChild(video);
  video.id = `${role}-video`;
  video.loop = true;
  util.listenForErrors(video, `${role}Video`, true);

  console.log(
    `${role} video selected: ${stream.src} (${stream.mimetype}), ` +
      `drm: ${drmMode}`,
  );

  if (
    role === 'secondary' &&
    typeof video.setMaxVideoCapabilities === 'function'
  ) {
    const {width, height, fps} = util.getVideoCapabilities(
      stream,
      config.isShorts,
    );
    const capsStr = `width=${width}; height=${height}; framerate=${fps};`;
    console.log(`set Max Video Capabilities: ${capsStr}`);
    video.setMaxVideoCapabilities(capsStr);
  }

  let cleanupDrm: (() => Promise<void>) | undefined;
  if (drmMode !== 'clear') {
    const licenseServerUrl = getLicenseServerUrl(stream, AV1_LICENSE_URL);
    cleanupDrm = await setupDrmForVideo(
      video,
      stream,
      drmMode,
      licenseServerUrl,
    );
  }

  const readyPromise = new Promise<void>((readyResolve) => {
    const onCanPlay = () => {
      video.removeEventListener('canplay', onCanPlay);
      readyResolve();
    };
    if (video.readyState >= 3) {
      readyResolve();
    } else {
      video.addEventListener('canplay', onCanPlay);
    }
  });

  const audioStream = role === 'primary' ? AAC['AudioNormal'] : null;
  const streamPromise = setupMse(
    video,
    stream,
    audioStream,
    /* stopTime= */ CONCURRENT_2027_CONFIG.stopTimeSec,
    /* numVideoStreams= */ 1,
    /* onSourceObjects= */ undefined,
    /* options= */ {disableTunnel: true},
  );

  return {video, readyPromise, streamPromise, cleanupDrm};
}
