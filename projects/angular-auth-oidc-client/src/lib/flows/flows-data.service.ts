import { Injectable } from '@angular/core';
import { ConfigurationProvider } from '../config/config.provider';
import { LoggerService } from '../logging/logger.service';
import { StorageKeys, StoragePersistanceService } from '../storage/storage-persistance.service';
import { RandomService } from './random/random.service';

export interface MutualExclusionLockingModel {
  xKey: StorageKeys,
  yKey: StorageKeys,
  state: string
}

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

  getAuthStateControl(): any {
    return this.storagePersistanceService.read('authStateControl');
  }

  setAuthStateControl(authStateControl: string) {
    this.storagePersistanceService.write('authStateControl', authStateControl);
  }

  getExistingOrCreateAuthStateControl(): any {
    let state = this.storagePersistanceService.read('authStateControl');
    if (!state) {
      state = this.randomService.createRandom(40);
      this.storagePersistanceService.write('authStateControl', state);
    }
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

  isSilentRenewRunning(state: string = null) {
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

      this.loggerService.logDebug(`isSilentRenewRunning > state: ${state} currentTime: ${new Date().toTimeString}`);
      if (!!state){
        this.loggerService.logDebug(`isSilentRenewRunning > state: ${state} > inside !!state > currentTime: ${new Date().toTimeString}`);
        return storageObject.state === state;
      }

      this.loggerService.logDebug(`isSilentRenewRunning > state: ${state} > after !!state > currentTime: ${new Date().toTimeString}`);

      return storageObject.state === 'running' || storageObject.state === 'onHandler';
    }

    return false;
  }

  setSilentRenewRunningOnHandlerWhenIsNotLauched(): Promise<boolean> {
    this.loggerService.logDebug(`setSilentRenewRunningOnHandlerWhenIsNotLauched currentTime: ${new Date().toTimeString}`);
    const lockingModel: MutualExclusionLockingModel  = {
      state: 'running',
      xKey: 'oidc-on-handler-running-x',
      yKey: 'oidc-on-handler-running-y'
    }

    return this.runMutualExclusionLockingAlgorithm(lockingModel, 'storageSilentRenewRunning');
  }

  setSilentRenewRunningWhenIsNotLauched(): Promise<boolean> {
    this.loggerService.logDebug(`setSilentRenewRunningWhenIsNotLauched currentTime: ${new Date().toTimeString}`);

    const lockingModel: MutualExclusionLockingModel  = {
      state: 'running',
      xKey: 'oidc-process-running-x',
      yKey: 'oidc-process-running-y'
    }

    return this.runMutualExclusionLockingAlgorithm(lockingModel, 'storageSilentRenewRunning');
  }

  private runMutualExclusionLockingAlgorithm(lockingModel: MutualExclusionLockingModel, key: StorageKeys): Promise<boolean> {
    return new Promise((resolve) => {
      const currentRandomId = `${Math.random().toString(36).substr(2, 9)}_${new Date().getUTCMilliseconds()}`;

      this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > currentRandomId: ${currentRandomId}`);

      const onSuccessLocking = () => {
        this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > INSIDE onSuccessLocking > currentRandomId: ${currentRandomId}`);
        if (this.isSilentRenewRunning(lockingModel.state)) {
          this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > INSIDE onSuccessLocking > this.isSilentRenewRunning return true we go back > currentRandomId: ${currentRandomId}`);
          resolve(false);
        } else {
          this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > INSIDE onSuccessLocking > VICTORY !!!! WE WIN AND SET VALUE> currentRandomId: ${currentRandomId}`);
          const storageObject = {
            state: lockingModel.state,
            dateOfLaunchedProcessUtc: new Date().toISOString(),
          }; 
          this.storagePersistanceService.write(key, JSON.stringify(storageObject));
          // Release lock
          this.storagePersistanceService.write(lockingModel.yKey, '');
          resolve(true);
        }
      };
      
      this.storagePersistanceService.write(lockingModel.xKey, currentRandomId);
      const readedValueY = this.storagePersistanceService.read(lockingModel.yKey)

      if (readedValueY !== '') {
        this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > readedValueY !== '' > currentRandomId: ${currentRandomId}`);
        const storageObject = JSON.parse(readedValueY);
        const dateOfLaunchedProcessUtc = Date.parse(storageObject.dateOfLaunchedProcessUtc);
        const currentDateUtc = Date.parse(new Date().toISOString());
        const elapsedTimeInMilliseconds = Math.abs(currentDateUtc - dateOfLaunchedProcessUtc);
        const isProbablyStuck = elapsedTimeInMilliseconds > this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000;

        if (isProbablyStuck){
           // Release lock
        this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > isProbablyStuck - clear Y key> currentRandomId: ${currentRandomId}`);
        this.storagePersistanceService.write(lockingModel.yKey, '');
        }

        resolve(false);
        return;
      }

      this.storagePersistanceService.write(lockingModel.yKey, JSON.stringify({
        id: currentRandomId,
        dateOfLaunchedProcessUtc: new Date().toISOString()
      }));

      if (this.storagePersistanceService.read(lockingModel.xKey) !== currentRandomId) {
        this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > before setTimeout > currentRandomId: ${currentRandomId}`);
        setTimeout(() => {
          if (this.storagePersistanceService.read(lockingModel.yKey) !== currentRandomId) {
            this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > inside setTimeout > we LOSE > currentRandomId: ${currentRandomId}`);
            resolve(false);
            return;
          }
          this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > inside setTimeout > we WIN > currentRandomId: ${currentRandomId}`);
          onSuccessLocking();
        }, Math.round(Math.random() * 100));
      } else {
        this.loggerService.logDebug(`runMutualExclusionLockingAlgorithm - state "${lockingModel.state}" > WE WIN ALL CONDITIONS > currentRandomId: ${currentRandomId}`);
        onSuccessLocking();
      }
    });
  }
}
