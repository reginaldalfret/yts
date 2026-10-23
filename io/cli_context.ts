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

export type CliName = 'tvh' | 'yts' | '';

/**
 * Options for constructing a CliContext instance.
 */
export interface CliContextOptions {
  cliName: CliName;
  storageDir: string;
  cliVersion: string;
  moduleDownloadUrl: string;
  getLatestVersion: () => Promise<string | undefined>;
}

/**
 * Class defining context information about the active CLI.
 */
export class CliContext {
  readonly cliName: CliName;
  readonly storageDir: string;
  readonly cliVersion: string;
  readonly moduleDownloadUrl: string;
  readonly getLatestVersion: () => Promise<string | undefined>;

  constructor(options: CliContextOptions) {
    this.cliName = options.cliName;
    this.storageDir = options.storageDir;
    this.cliVersion = options.cliVersion;
    this.moduleDownloadUrl = options.moduleDownloadUrl;
    this.getLatestVersion = options.getLatestVersion;
  }
}

const DEFAULT_CONTEXT = new CliContext({
  cliName: 'yts',
  storageDir: 'yts_server',
  cliVersion: 'unknown',
  moduleDownloadUrl: 'unknown',
  getLatestVersion: async () => 'unknown',
});

let activeContext: CliContext = DEFAULT_CONTEXT;

/**
 * Sets the active CliContext instance.
 */
export function setCliContext(context: CliContext): void {
  activeContext = context;
}

/**
 * Resets the active CliContext instance to default values (primarily for tests).
 */
export function resetCliContext(): void {
  activeContext = DEFAULT_CONTEXT;
}

/**
 * Singleton proxy delegating to the active CliContext instance.
 */
export const cliContext: CliContext = {
  get cliName(): CliName {
    return activeContext.cliName;
  },
  get storageDir(): string {
    return activeContext.storageDir;
  },
  get cliVersion(): string {
    return activeContext.cliVersion;
  },
  get moduleDownloadUrl(): string {
    return activeContext.moduleDownloadUrl;
  },
  getLatestVersion(): Promise<string | undefined> {
    return activeContext.getLatestVersion();
  },
};
