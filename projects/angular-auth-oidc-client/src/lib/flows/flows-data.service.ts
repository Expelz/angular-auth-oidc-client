import { Injectable } from '@angular/core';
import { ConfigurationProvider } from '../config/config.provider';
import { LoggerService } from '../logging/logger.service';
import { StorageKeys, StoragePersistanceService } from '../storage/storage-persistance.service';
import { RandomService } from './random/random.service';

export interface MutualExclusionLockingModel {
  xKey: StorageKeys;
  yKey: StorageKeys;
  state: string;
}

export type AuthStateLauchedType = 'login' | 'silent-renew-code' | 'refresh-token';

@Injectable()
export class FlowsDataService {
  constructor(
    private storagePersistanceService: StoragePersistanceService,
    private randomService: RandomService,
    private configurationProvider: ConfigurationProvider,
    private loggerService: LoggerService
  ) {}

  createNonce(): string {
    const nonce = this.randomService.createRandom(40);
    this.setNonce(nonce);
    return nonce;
  }

  setNonce(nonce: string) {
    this.storagePersistanceService.write('authNonce', nonce);
  }

  getAuthStateControlWithoutAnyCheck(): any {
    const json = this.storagePersistanceService.read('authStateControl');
    const storageObject = !!json ? JSON.parse(json) : null;

    this.loggerService.logDebug(
      `getAuthStateControlWithoutAnyCheck > currentTime: ${new Date().toTimeString()} > storageObject see inner details:`,
      storageObject
    );

    if (storageObject) {
      this.loggerService.logDebug(
        `getAuthStateControlWithoutAnyCheck > storageObject.lauchedFrom ${storageObject.lauchedFrom} > STATE SUCCESSFULLY RETURNED ${
          storageObject.state
        } > currentTime: ${new Date().toTimeString()}`
      );

      return storageObject.state;
    }

    this.loggerService.logWarning(
      `getAuthStateControlWithoutAnyCheck > storageObject IS NULL RETURN FALSE > currentTime: ${new Date().toTimeString()}`
    );

    return false;
  }

  getAuthStateControl(authStateLauchedType: AuthStateLauchedType = null): any {
    const json = this.storagePersistanceService.read('authStateControl');
    const storageObject = !!json ? JSON.parse(json) : null;

    this.loggerService.logDebug(
      `getAuthStateControl > currentTime: ${new Date().toTimeString()} > storageObject see inner details:`,
      storageObject
    );

    if (storageObject) {
      if (authStateLauchedType === 'login' && storageObject.lauchedFrom !== 'login') {
        this.loggerService.logWarning(
          `getAuthStateControl > STATE SHOULD BE RE-INITIALIZED FOR LOGIN FLOW > currentTime: ${new Date().toTimeString()}`
        );
        return false;
      }

      if (storageObject.lauchedFrom === 'silent-renew-code') {
        this.loggerService.logDebug(
          `getAuthStateControl > STATE LAUNCHED FROM SILENT RENEW: ${storageObject.state} > storageObject.lauchedFrom ${
            storageObject.lauchedFrom
          } >  currentTime: ${new Date().toTimeString()}`
        );
        const dateOfLaunchedProcessUtc = Date.parse(storageObject.dateOfLaunchedProcessUtc);
        const currentDateUtc = Date.parse(new Date().toISOString());
        const elapsedTimeInMilliseconds = Math.abs(currentDateUtc - dateOfLaunchedProcessUtc);
        const isProbablyStuck =
          elapsedTimeInMilliseconds > this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000;

        if (isProbablyStuck) {
          this.loggerService.logWarning('getAuthStateControl -> silent renew process is probably stuck, AuthState will be reset.');
          this.storagePersistanceService.write('authStateControl', '');
          return false;
        }
      }

      this.loggerService.logDebug(
        `getAuthStateControl > storageObject.lauchedFrom ${storageObject.lauchedFrom} > STATE SUCCESSFULLY RETURNED ${
          storageObject.state
        } > currentTime: ${new Date().toTimeString()}`
      );

      return storageObject.state;
    }

    this.loggerService.logWarning(`getAuthStateControl > storageObject IS NULL RETURN FALSE > currentTime: ${new Date().toTimeString()}`);

    return false;
  }

  setAuthStateControl(authStateControl: string) {
    this.storagePersistanceService.write('authStateControl', authStateControl);
  }

  getExistingOrCreateAuthStateControl(authStateLauchedType: AuthStateLauchedType): any {
    let state = this.getAuthStateControl(authStateLauchedType);
    if (!state) {
      state = this.createAuthStateControl(authStateLauchedType);
    }
    return state;
  }

  createAuthStateControl(authStateLauchedType: AuthStateLauchedType): any {
    const state = this.randomService.createRandom(40);
    const storageObject = {
      state: state,
      dateOfLaunchedProcessUtc: new Date().toISOString(),
      lauchedFrom: authStateLauchedType,
    };
    this.storagePersistanceService.write('authStateControl', JSON.stringify(storageObject));
    return state;
  }

  setSessionState(sessionState: any) {
    this.storagePersistanceService.write('session_state', sessionState);
  }

  resetStorageFlowData() {
    this.storagePersistanceService.resetStorageFlowData();
  }

  getCodeVerifier() {
    return this.storagePersistanceService.read('codeVerifier');
  }

  createCodeVerifier() {
    const codeVerifier = this.randomService.createRandom(67);
    this.storagePersistanceService.write('codeVerifier', codeVerifier);
    return codeVerifier;
  }

  // isSilentRenewRunning() {
  //   const storageObject = JSON.parse(this.storagePersistanceService.read('storageSilentRenewRunning'));

  //   if (storageObject) {
  //     const dateOfLaunchedProcessUtc = Date.parse(storageObject.dateOfLaunchedProcessUtc);
  //     const currentDateUtc = Date.parse(new Date().toISOString());
  //     const elapsedTimeInMilliseconds = Math.abs(currentDateUtc - dateOfLaunchedProcessUtc);
  //     const isProbablyStuck = elapsedTimeInMilliseconds > this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000;

  //     if (isProbablyStuck) {
  //       this.loggerService.logDebug('silent renew process is probably stuck, state will be reset.');
  //       this.resetSilentRenewRunning();
  //       return false;
  //     }

  //     return storageObject.state === 'running';
  //   }

  //   return false;
  // }

  setSilentRenewRunning() {
    const storageObject = {
      state: 'running',
      dateOfLaunchedProcessUtc: new Date().toISOString(),
    };

    this.storagePersistanceService.write('storageSilentRenewRunning', JSON.stringify(storageObject));
  }

  resetSilentRenewRunning() {
    this.storagePersistanceService.write('storageSilentRenewRunning', '');
  }

  // isSilentRenewRunning() {
  //   const json = this.storagePersistanceService.read('storageSilentRenewRunning');
  //   const storageObject = !!json ? JSON.parse(json) : null;

  //   if (storageObject) {
  //     const dateOfLaunchedProcessUtc = Date.parse(storageObject.dateOfLaunchedProcessUtc);
  //     const currentDateUtc = Date.parse(new Date().toISOString());
  //     const elapsedTimeInMilliseconds = Math.abs(currentDateUtc - dateOfLaunchedProcessUtc);
  //     const isProbablyStuck = elapsedTimeInMilliseconds > this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000;

  //     if (isProbablyStuck) {
  //       this.loggerService.logDebug('silent renew process is probably stuck, state will be reset.');
  //       this.resetSilentRenewRunning();
  //       return false;
  //     }

  //     this.loggerService.logDebug(`isSilentRenewRunning > currentTime: ${new Date().toTimeString()}`);

  //     return storageObject.state === 'running';
  //   }

  //   return false;
  // }

  isSilentRenewRunning() {
    const json = this.storagePersistanceService.read('storageSilentRenewRunning');
    const storageObject = !!json ? JSON.parse(json) : null;

    if (storageObject) {
      const dateOfLaunchedProcessUtc = Date.parse(storageObject.dateOfLaunchedProcessUtc);
      const currentDateUtc = Date.parse(new Date().toISOString());
      const elapsedTimeInMilliseconds = Math.abs(currentDateUtc - dateOfLaunchedProcessUtc);
      const isProbablyStuck = elapsedTimeInMilliseconds > this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000;

      if (isProbablyStuck) {
        this.loggerService.logDebug('silent renew process is probably stuck, state will be reset.');
        this.resetSilentRenewRunning();
        return false;
      }

      this.loggerService.logDebug(`isSilentRenewRunning > currentTime: ${new Date().toTimeString()}`);

      return storageObject.state === 'running';
    }

    return false;
  }

  // setSilentRenewRunningOnHandlerWhenIsNotLauched(): Promise<boolean> {
  //   this.loggerService.logDebug(`setSilentRenewRunningOnHandlerWhenIsNotLauched currentTime: ${new Date().toTimeString()}`);
  //   const lockingModel: MutualExclusionLockingModel  = {
  //     state: 'onHandler',
  //     xKey: 'oidc-on-handler-running-x',
  //     yKey: 'oidc-on-handler-running-y'
  //   }

  //   return this.runMutualExclusionLockingAlgorithm(lockingModel, 'storageSilentRenewRunning');
  // }

  // setSilentRenewRunningWhenIsNotLauched(): Promise<boolean> {
  //   this.loggerService.logDebug(`setSilentRenewRunningWhenIsNotLauched currentTime: ${new Date().toTimeString()}`);

  //   const lockingModel: MutualExclusionLockingModel  = {
  //     state: 'running',
  //     xKey: 'oidc-process-running-x',
  //     yKey: 'oidc-process-running-y'
  //   }

  //   return this.runMutualExclusionLockingAlgorithm(lockingModel, 'storageSilentRenewRunning');
  // }

  // private runMutualExclusionLockingAlgorithm(lockingModel: MutualExclusionLockingModel, key: StorageKeys): Promise<boolean> {
  //   return new Promise((resolve) => {
  //     const currentRandomId = `${Math.random().toString(36).substr(2, 9)}_${new Date().getUTCMilliseconds()}`;

  //     this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > currentRandomId: ${currentRandomId}`);

  //     const onSuccessLocking = () => {
  //       this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > INSIDE onSuccessLocking > currentRandomId: ${currentRandomId}`);
  //       if (this.isSilentRenewRunning(lockingModel.state)) {
  //         this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > INSIDE onSuccessLocking > this.isSilentRenewRunning return true we go back > currentRandomId: ${currentRandomId}`);
  //         resolve(false);
  //       } else {
  //         this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > INSIDE onSuccessLocking > VICTORY !!!! WE WIN AND SET VALUE> currentRandomId: ${currentRandomId}`);
  //         const storageObject = {
  //           state: lockingModel.state,
  //           dateOfLaunchedProcessUtc: new Date().toISOString(),
  //         };
  //         this.storagePersistanceService.write(key, JSON.stringify(storageObject));
  //         // Release lock
  //         this.storagePersistanceService.write(lockingModel.yKey, '');
  //         resolve(true);
  //       }
  //     };

  //     this.storagePersistanceService.write(lockingModel.xKey, currentRandomId);
  //     const readedValueY = this.storagePersistanceService.read(lockingModel.yKey)

  //     if (!!readedValueY) {
  //       this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > readedValueY !== '' > currentRandomId: ${currentRandomId}`);
  //       const storageObject = JSON.parse(readedValueY);
  //       const dateOfLaunchedProcessUtc = Date.parse(storageObject.dateOfLaunchedProcessUtc);
  //       const currentDateUtc = Date.parse(new Date().toISOString());
  //       const elapsedTimeInMilliseconds = Math.abs(currentDateUtc - dateOfLaunchedProcessUtc);
  //       const isProbablyStuck = elapsedTimeInMilliseconds > this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000;

  //       if (isProbablyStuck){
  //          // Release lock
  //       this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > isProbablyStuck - clear Y key> currentRandomId: ${currentRandomId}`);
  //       this.storagePersistanceService.write(lockingModel.yKey, '');
  //       }

  //       resolve(false);
  //       return;
  //     }

  //     this.storagePersistanceService.write(lockingModel.yKey, JSON.stringify({
  //       id: currentRandomId,
  //       dateOfLaunchedProcessUtc: new Date().toISOString()
  //     }));

  //     if (this.storagePersistanceService.read(lockingModel.xKey) !== currentRandomId) {
  //       this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > before setTimeout > currentRandomId: ${currentRandomId}`);
  //       setTimeout(() => {
  //         if (this.storagePersistanceService.read(lockingModel.yKey) !== currentRandomId) {
  //           this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > inside setTimeout > we LOSE > currentRandomId: ${currentRandomId}`);
  //           resolve(false);
  //           return;
  //         }
  //         this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > inside setTimeout > we WIN > currentRandomId: ${currentRandomId}`);
  //         onSuccessLocking();
  //       }, Math.round(Math.random() * 100));
  //     } else {
  //       this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > WE WIN ALL CONDITIONS > currentRandomId: ${currentRandomId}`);
  //       onSuccessLocking();
  //     }
  //   });
  // }
}
