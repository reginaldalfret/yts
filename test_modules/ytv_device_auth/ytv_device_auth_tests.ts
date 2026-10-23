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

import 'yts';

import {Device, Script} from 'google3/third_party/javascript/yts/devices/interfaces';
import {deviceUnderTest} from 'google3/third_party/javascript/yts/test_context';
describe('YTV Device Authentication', () => {
  let device!: Device;
  let script!: Script;

  beforeAll(async () => {
    device = await deviceUnderTest();
    script = await device.launchScript({
      app: 'YouTubeTV',
      scriptModule: 'test_modules/ytv_device_auth/scripts/scripts.js',
    });
  }, 120_000);

  afterAll(async () => {
    if (!device) {
      return;
    }
    await device.stop('YouTubeTV');
  }, 120_000);

  describe('Cert Scope', () => {
    yts.test({id: '0EBF26DB-207C-4E8E-907A-611D5051514E'});
    it(
        'Presence',
        async () => {
          const search = (await script.invoke(
                             'readProp',
                             'window.location.search',
                             )) as string;

          const params = new URLSearchParams(search);
          const certScope = params.get('cert_scope');

          yts.setMetrics({
            'search_fragment': search,
            'cert_scope': certScope,
          });

          if (!certScope) {
            fail('No cert_scope parameter found');
          }
        },
        30 * 1_000,
    );
  });
});
