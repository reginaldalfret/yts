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

import 'jasmine';

import {CobaltVideoElement} from 'google3/third_party/javascript/yts/test_utils/cobalt_video_element';
import {
  AV1,
  H264,
  VP9,
} from 'google3/third_party/javascript/yts/test_utils/streams/media_streams';

import {AV1_LICENSE_URL} from './dual_drm_test_constants';
import {
  cleanUpDualVideoStyle,
  cleanUpVideoAndContainer,
  getLicenseServerUrl,
  getPrimaryStream,
  getSecondaryStream,
  initializeDualVideoStyle,
  monitorConcurrentPlayback,
  setupDrmForVideo,
} from './dual_drm_video_helpers';

describe('dual_drm_video_helpers', () => {
  afterEach(() => {
    cleanUpDualVideoStyle();
    cleanUpVideoAndContainer('primary-video', 'primary-container');
    cleanUpVideoAndContainer('secondary-video', 'secondary-container');
  });

  describe('initializeDualVideoStyle and cleanUpDualVideoStyle', () => {
    it('injects scoped style element once and removes it on cleanup', () => {
      expect(document.getElementById('dual-video-style')).toBeNull();

      initializeDualVideoStyle();
      const styleEl = document.getElementById('dual-video-style');
      expect(styleEl).not.toBeNull();
      expect(styleEl!.textContent).toContain('#primary-container video');
      expect(styleEl!.textContent).toContain('#secondary-container video');

      // Calling a second time is idempotent.
      initializeDualVideoStyle();
      expect(document.querySelectorAll('#dual-video-style').length).toBe(1);

      cleanUpDualVideoStyle();
      expect(document.getElementById('dual-video-style')).toBeNull();
    });
  });

  describe('cleanUpVideoAndContainer', () => {
    it('removes both the video element and its container from the DOM', () => {
      const container = document.createElement('div');
      container.id = 'primary-container';
      const video = document.createElement('video');
      video.id = 'primary-video';
      container.appendChild(video);
      document.body.appendChild(container);

      cleanUpVideoAndContainer('primary-video', 'primary-container');

      expect(document.getElementById('primary-video')).toBeNull();
      expect(document.getElementById('primary-container')).toBeNull();
    });
  });

  describe('getLicenseServerUrl', () => {
    it('builds license URL from stream video_id and widevine_signature', () => {
      const url = getLicenseServerUrl(AV1['SencSdr2160p30']);
      expect(url).toContain('video_id=6508f99557a8385f');
      expect(url).toContain('key=ik0');
    });

    it('falls back to defaultUrl or AV1_LICENSE_URL for clear streams', () => {
      expect(
        getLicenseServerUrl(H264['VideoNormal'], 'https://example.com/lic'),
      ).toBe('https://example.com/lic');
      expect(getLicenseServerUrl(H264['VideoNormal'])).toBe(AV1_LICENSE_URL);
    });
  });

  describe('getPrimaryStream and getSecondaryStream', () => {
    let originalIsTypeSupported: (mimeType: string) => boolean;
    let originalInnerWidth: number;
    let originalInnerHeight: number;
    let originalDevicePixelRatio: number;

    beforeEach(() => {
      originalIsTypeSupported = MediaSource.isTypeSupported;
      originalInnerWidth = window.innerWidth;
      originalInnerHeight = window.innerHeight;
      originalDevicePixelRatio = window.devicePixelRatio;
    });

    afterEach(() => {
      MediaSource.isTypeSupported = originalIsTypeSupported;
      Object.defineProperty(window, 'innerWidth', {
        value: originalInnerWidth,
        configurable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      });
      Object.defineProperty(window, 'devicePixelRatio', {
        value: originalDevicePixelRatio,
        configurable: true,
      });
    });

    function configureDisplayTier(tier: '8k' | '4k' | 'fhd' | 'hd'): void {
      const dimensions: Record<typeof tier, [number, number]> = {
        '8k': [7680, 4320],
        '4k': [3840, 2160],
        'fhd': [1920, 1080],
        'hd': [1280, 720],
      };
      const [maxW, maxH] = dimensions[tier];
      Object.defineProperty(window, 'innerWidth', {
        value: maxW,
        configurable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        value: maxH,
        configurable: true,
      });
      Object.defineProperty(window, 'devicePixelRatio', {
        value: 1,
        configurable: true,
      });

      MediaSource.isTypeSupported = (mime: string): boolean => {
        if (mime.includes('9999')) return false;
        if (mime.includes('7680')) return tier === '8k';
        if (mime.includes('3840')) return tier === '8k' || tier === '4k';
        if (mime.includes('1920') || mime.includes('av01.0.08M')) {
          return tier !== 'hd';
        }
        return true;
      };
    }

    it('selects 2160p primary and 720p secondary streams on 8K devices', () => {
      configureDisplayTier('8k');
      expect(getPrimaryStream('av1', 'hw')).toBe(AV1['SencSdr2160p30']);
      expect(getPrimaryStream('av1', 'clear')).toBe(AV1['Sdr2160p30']);
      expect(getPrimaryStream('vp9', 'clear', true)).toBe(VP9['Shorts313']);
      expect(getSecondaryStream('av1', 'hw')).toBe(AV1['SencSdr720p30']);
      expect(getSecondaryStream('vp9', 'hw')).toBe(
        VP9['DrmL3NoHDCP720p30fpsEnc'],
      );
    });

    it(
      'selects 1080p60 primary and 720p secondary streams on 4K devices',
      () => {
        configureDisplayTier('4k');
        expect(getPrimaryStream('av1', 'hw')).toBe(AV1['SencSdr1080p60']);
        expect(getPrimaryStream('av1', 'clear')).toBe(AV1['Bunny1080p60fps']);
        expect(getPrimaryStream('vp9', 'clear', true)).toBe(VP9['Shorts248']);
        expect(getPrimaryStream('h264', 'clear')).toBe(H264['VideoHuge']);
        expect(getSecondaryStream('h264', 'clear')).toBe(H264['VideoNormal']);
      },
    );

    it(
      'selects <=FHD primary and 480p secondary streams on FHD/HD devices',
      () => {
        configureDisplayTier('fhd');
        expect(getPrimaryStream('av1', 'hw')).toBe(AV1['SencSdr1080p30']);
        expect(getPrimaryStream('vp9', 'clear', true)).toBe(VP9['Shorts247']);
        expect(getPrimaryStream('h264', 'clear')).toBe(H264['VideoNormal']);
        expect(getSecondaryStream('av1', 'hw')).toBe(AV1['SencSdr480p30']);
        expect(getSecondaryStream('vp9', 'hw')).toBe(
          VP9['DrmL3NoHDCP480p30fpsEnc'],
        );
        expect(getSecondaryStream('h264', 'clear', true)).toBe(
          H264['Shorts135'],
        );

        configureDisplayTier('hd');
        expect(getPrimaryStream('av1', 'hw')).toBe(AV1['SencSdr720p30']);
        expect(getPrimaryStream('av1', 'clear')).toBe(AV1['Bunny720p30fps']);
      },
    );
  });

  describe('monitorConcurrentPlayback', () => {
    function createMockVideos(
      getPrimaryTime: () => number,
      getSecondaryTime: () => number,
    ): void {
      const pContainer = document.createElement('div');
      pContainer.id = 'primary-container';
      const pVideo = document.createElement('video');
      pVideo.id = 'primary-video';
      Object.defineProperty(pVideo, 'currentTime', {
        get: getPrimaryTime,
        configurable: true,
      });
      pContainer.appendChild(pVideo);
      document.body.appendChild(pContainer);

      const sContainer = document.createElement('div');
      sContainer.id = 'secondary-container';
      const sVideo = document.createElement('video');
      sVideo.id = 'secondary-video';
      Object.defineProperty(sVideo, 'currentTime', {
        get: getSecondaryTime,
        configurable: true,
      });
      sContainer.appendChild(sVideo);
      document.body.appendChild(sContainer);
    }

    it('resolves when both videos advance simultaneously', async () => {
      const startMs = Date.now();
      createMockVideos(
        () => 1.5 + (Date.now() - startMs) / 1000,
        () => 1.5 + (Date.now() - startMs) / 1000,
      );

      await expectAsync(
        monitorConcurrentPlayback({
          primaryVideoId: 'primary-video',
          secondaryVideoId: 'secondary-video',
          primaryStartThresholdSec: 1,
          secondaryStartThresholdSec: 1,
          requiredConcurrentSec: 0.05,
          maxStallSec: 0.5,
          timeoutSec: 1,
          pollIntervalMs: 15,
        }),
      ).toBeResolved();
    });

    it(
      'handles loop wraparound on short streams without false stall',
      async () => {
        let tick = 0;
        const primaryTimes = [1.5, 2.0, 0.1, 0.6, 1.1, 1.6];
        const secondaryTimes = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
        createMockVideos(
          () => primaryTimes[Math.min(tick, primaryTimes.length - 1)],
          () => {
            const val =
              secondaryTimes[Math.min(tick, secondaryTimes.length - 1)];
            tick++;
            return val;
          },
        );

        await expectAsync(
          monitorConcurrentPlayback({
            primaryVideoId: 'primary-video',
            secondaryVideoId: 'secondary-video',
            primaryStartThresholdSec: 1,
            secondaryStartThresholdSec: 1,
            requiredConcurrentSec: 0.04,
            maxStallSec: 0.03,
            timeoutSec: 1,
            pollIntervalMs: 15,
          }),
        ).toBeResolved();
      },
    );

    it(
      'rejects when both videos stall simultaneously (mutual stall)',
      async () => {
        createMockVideos(
          () => 2.0,
          () => 2.0,
        );

        await expectAsync(
          monitorConcurrentPlayback({
            primaryVideoId: 'primary-video',
            secondaryVideoId: 'secondary-video',
            primaryStartThresholdSec: 1,
            secondaryStartThresholdSec: 1,
            requiredConcurrentSec: 0.5,
            maxStallSec: 0.03,
            timeoutSec: 1,
            pollIntervalMs: 15,
          }),
        ).toBeRejectedWithError(/both videos stalled/);
      },
    );
  });

  describe('setupDrmForVideo', () => {
    it('closes MediaKeySession and clears MediaKeys on cleanup', async () => {
      let sessionClosed = false;
      let lastMediaKeys: unknown = 'uninitialized';

      const mockSession = {
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        close: jasmine.createSpy('close').and.callFake(async () => {
          sessionClosed = true;
        }),
      };
      const mockMediaKeys = {
        createSession: () => mockSession,
      };
      const mockAccess = {
        createMediaKeys: async () => mockMediaKeys,
      };

      const originalDescriptor = Object.getOwnPropertyDescriptor(
        navigator,
        'requestMediaKeySystemAccess',
      );
      Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
        value: jasmine
          .createSpy('requestMediaKeySystemAccess')
          .and.resolveTo(mockAccess as unknown as MediaKeySystemAccess),
        configurable: true,
        writable: true,
      });

      const video = document.createElement('video') as CobaltVideoElement;
      video.setMediaKeys = jasmine
        .createSpy('setMediaKeys')
        .and.callFake(async (keys: MediaKeys | null) => {
          lastMediaKeys = keys;
        });

      try {
        const cleanup = await setupDrmForVideo(
          video,
          AV1['SencSdr2160p30'],
          'hw',
          AV1_LICENSE_URL,
        );
        expect(lastMediaKeys).toBe(mockMediaKeys);

        await cleanup();
        expect(sessionClosed).toBeTrue();
        expect(lastMediaKeys).toBeNull();
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(
            navigator,
            'requestMediaKeySystemAccess',
            originalDescriptor,
          );
        } else {
          delete (navigator as {requestMediaKeySystemAccess?: unknown})
            .requestMediaKeySystemAccess;
        }
      }
    });
  });
});
