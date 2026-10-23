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

import {
  CliContext,
  cliContext,
  resetCliContext,
  setCliContext,
} from './cli_context';

describe('CliContext', () => {
  afterEach(() => {
    resetCliContext();
  });

  it('defaults to expected fallback values before setCliContext', async () => {
    expect(cliContext.cliName).toBe('yts');
    expect(cliContext.cliVersion).toBe('unknown');
    expect(cliContext.storageDir).toBe('yts_server');
    expect(cliContext.moduleDownloadUrl).toBe('unknown');
    expect(await cliContext.getLatestVersion()).toBe('unknown');
  });

  it('constructs CliContext instance and returns values', async () => {
    const context = new CliContext({
      cliName: 'tvh',
      cliVersion: '1.2.3',
      storageDir: 'tvh',
      moduleDownloadUrl: 'test_bucket_url',
      getLatestVersion: async () => '1.2.4',
    });

    expect(context.cliName).toBe('tvh');
    expect(context.cliVersion).toBe('1.2.3');
    expect(context.storageDir).toBe('tvh');
    expect(context.moduleDownloadUrl).toBe('test_bucket_url');
    expect(await context.getLatestVersion()).toBe('1.2.4');
  });

  it('returns values from active context after setCliContext', async () => {
    const mockContext = new CliContext({
      cliName: 'tvh',
      cliVersion: '1.2.3',
      storageDir: 'tvh',
      moduleDownloadUrl: 'test_bucket_url',
      getLatestVersion: async () => '1.2.4',
    });
    setCliContext(mockContext);

    expect(cliContext.cliName).toBe('tvh');
    expect(cliContext.cliVersion).toBe('1.2.3');
    expect(cliContext.storageDir).toBe('tvh');
    expect(cliContext.moduleDownloadUrl).toBe('test_bucket_url');
    expect(await cliContext.getLatestVersion()).toBe('1.2.4');
  });

  it('resets context properly with resetCliContext', async () => {
    setCliContext(
      new CliContext({
        cliName: 'tvh',
        cliVersion: '27.1',
        storageDir: 'custom_storage_dir',
        moduleDownloadUrl: 'test_bucket_url',
        getLatestVersion: async () => '27.1',
      }),
    );
    expect(cliContext.cliName).toBe('tvh');

    resetCliContext();
    expect(cliContext.cliName).toBe('yts');
    expect(cliContext.cliVersion).toBe('unknown');
    expect(cliContext.storageDir).toBe('yts_server');
    expect(cliContext.moduleDownloadUrl).toBe('unknown');
    expect(await cliContext.getLatestVersion()).toBe('unknown');
  });
});
