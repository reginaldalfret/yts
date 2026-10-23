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
import {StreamPromise} from 'google3/third_party/javascript/yts/test_utils/streaming/stream_promise';
import {StreamDef} from 'google3/third_party/javascript/yts/test_utils/streams/interfaces';

/** Widevine license server URL for AV1 test streams. */
export const AV1_LICENSE_URL =
  'https://dash-mse-test.appspot.com/api/drm/widevine?drm_system=widevine' +
  '&source=YOUTUBE&ip=0.0.0.0&ipbits=0&expire=19000000000&key=ik0' +
  '&sparams=ip,ipbits,expire,drm_system,source,video_id' +
  '&video_id=6508f99557a8385f&signature=' +
  '5153900DAC410803EC269D252DAAA82BA6D8B825.' +
  '495E631E406584A8EFCB4E9C9F3D45F6488B94E4';

/** Widevine license server URL for H.264 test streams. */
export const H264_LICENSE_URL =
  'https://dash-mse-test.appspot.com/api/drm/widevine?drm_system=widevine' +
  '&source=YOUTUBE&ip=0.0.0.0&ipbits=0&expire=19000000000&key=test_key1' +
  '&sparams=ip,ipbits,expire,drm_system,source,video_id' +
  '&video_id=03681262dc412c06&signature=' +
  '9C4BE99E6F517B51FED1F0B3B31966D3C5DAB9D6.' +
  '6A1F30BB35F3A39A4CA814B731450D4CBD198FFD';

/** Allowed drift percentage when validating currentTime against wall clock. */
export const ERROR_MARGIN_PERCENT = 5;

/** Seconds between currentTime validation checkpoints in the legacy test. */
export const MEASUREMENT_THRESHOLD = 5;

/** Warm-up buffer in seconds for HDR initialization. */
export const HDR_WARMUP_THRESHOLD = 10;

/** Seconds to wait after seek before taking the initial time snapshot. */
export const PRE_MEASUREMENT_THRESHOLD = 1;

/** Initial seek offset in seconds for the primary DRM video. */
export const PRIMARY_DRM_VIDEO_START_TIME = 5;

/** Initial seek offset in seconds for the secondary DRM video. */
export const SECONDARY_DRM_VIDEO_START_TIME = 10;

/** Total playback duration in seconds required before resolving. */
export const TEST_DONE_THRESHOLD =
  PRE_MEASUREMENT_THRESHOLD + 3 * MEASUREMENT_THRESHOLD;

/** Per-video timeout threshold in seconds. */
export const VIDEO_TIMEOUT_THRESHOLD = 30 + TEST_DONE_THRESHOLD;

/** Overall Jasmine test timeout in seconds. */
export const TEST_TIMEOUT =
  60 + HDR_WARMUP_THRESHOLD + VIDEO_TIMEOUT_THRESHOLD;

/** Delay in milliseconds before applying a license update to a key session. */
export const LICENSE_DELAY_MS = 10;

/** Timing thresholds for 2027 concurrent playback verification. */
export interface ConcurrentPlaybackConfig {
  readonly primaryStartTimeThresholdSec: number;
  readonly secondaryStartTimeThresholdSec: number;
  readonly requiredConcurrentSec: number;
  readonly maxStallSec: number;
  readonly playbackTimeoutSec: number;
  readonly bufferingTimeoutMs: number;
  readonly stopTimeSec: number;
  readonly decoderFlushDelaySec: number;
}

/** Default timing configuration for 2027 concurrent playback tests. */
export const CONCURRENT_2027_CONFIG: ConcurrentPlaybackConfig = {
  primaryStartTimeThresholdSec: 1,
  secondaryStartTimeThresholdSec: 1,
  requiredConcurrentSec: 4,
  maxStallSec: 8,
  playbackTimeoutSec: 25,
  bufferingTimeoutMs: 15000,
  stopTimeSec: 15,
  decoderFlushDelaySec: 0.5,
};

/** DRM protection level for a test stream. */
export type DrmMode = 'hw' | 'sw' | 'clear';

/** Supported video codec families for concurrent playback tests. */
export type VideoCodecType = 'av1' | 'vp9' | 'h264';

/** Configuration for a single primary or secondary video player. */
export interface VideoStreamConfig {
  readonly codec: VideoCodecType;
  readonly drm?: DrmMode;
  readonly isShorts?: boolean;
  readonly stream?: StreamDef;
}

/** Initialized DOM video element and associated streaming promises. */
export interface VideoElementSetup {
  readonly video: CobaltVideoElement;
  readonly readyPromise: Promise<void>;
  readonly streamPromise: StreamPromise<void>;
  readonly cleanupDrm?: () => Promise<void>;
}

/** Options for monitoring simultaneous playback progression of two videos. */
export interface ConcurrentPlaybackMonitorOptions {
  readonly primaryVideoId: string;
  readonly secondaryVideoId: string;
  readonly primaryStartThresholdSec: number;
  readonly secondaryStartThresholdSec: number;
  readonly requiredConcurrentSec: number;
  readonly maxStallSec: number;
  readonly timeoutSec: number;
  readonly pollIntervalMs?: number;
}
