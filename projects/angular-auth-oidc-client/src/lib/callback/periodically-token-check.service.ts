import { Injectable } from '@angular/core';
import { from, of, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { AuthStateService } from '../authState/auth-state.service';
import { ConfigurationProvider } from '../config/config.provider';
import { FlowsDataService } from '../flows/flows-data.service';
import { FlowsService } from '../flows/flows.service';
import { RefreshSessionIframeService } from '../iframe/refresh-session-iframe.service';
import { LoggerService } from '../logging/logger.service';
import { StoragePersistanceService } from '../storage/storage-persistance.service';
import { UserService } from '../userData/user-service';
import { FlowHelper } from '../utils/flowHelper/flow-helper.service';
import { TabsSynchronizationService } from './../iframe/tabs-synchronization.service';
import { IntervallService } from './intervall.service';
import { RefreshSessionRefreshTokenService } from './refresh-session-refresh-token.service';

@Injectable({ providedIn: 'root' })
export class PeriodicallyTokenCheckService {
  constructor(
    private flowsService: FlowsService,
    private flowHelper: FlowHelper,
    private configurationProvider: ConfigurationProvider,
    private flowsDataService: FlowsDataService,
    private loggerService: LoggerService,
    private userService: UserService,
    private authStateService: AuthStateService,
    private refreshSessionIframeService: RefreshSessionIframeService,
    private refreshSessionRefreshTokenService: RefreshSessionRefreshTokenService,
    private intervalService: IntervallService,
    private storagePersistanceService: StoragePersistanceService,
    private tabsSynchronizationService: TabsSynchronizationService
  ) {}

  startTokenValidationPeriodically(repeatAfterSeconds: number) {
    if (!!this.intervalService.runTokenValidationRunning || !this.configurationProvider.openIDConfiguration.silentRenew) {
      return;
    }

    this.loggerService.logDebug(`starting token validation check every ${repeatAfterSeconds}s`);

    const periodicallyCheck$ = this.intervalService.startPeriodicTokenCheck(repeatAfterSeconds).pipe(
      switchMap(() => {
        const idToken = this.authStateService.getIdToken();
        const isSilentRenewRunning = this.flowsDataService.isSilentRenewRunning();
        const userDataFromStore = this.userService.getUserDataFromStore();

        this.loggerService.logDebug(
          `Checking: silentRenewRunning: ${isSilentRenewRunning} id_token: ${!!idToken} userData: ${!!userDataFromStore}`
        );

        const shouldBeExecuted = userDataFromStore && !isSilentRenewRunning && idToken;

        if (!shouldBeExecuted) {
          return of(null);
        }

        const idTokenHasExpired = this.authStateService.hasIdTokenExpired();
        const accessTokenHasExpired = this.authStateService.hasAccessTokenExpiredIfExpiryExists();

        if (!idTokenHasExpired && !accessTokenHasExpired) {
          return of(null);
        }

        if (!this.configurationProvider.openIDConfiguration.silentRenew) {
          this.flowsService.resetAuthorizationData();
          return of(null);
        }

        this.loggerService.logDebug('starting silent renew...');

        return from(this.tabsSynchronizationService.isLeaderCheck()).pipe(
          take(1),
          switchMap((isLeader) => {
            if (isLeader && !this.flowsDataService.isSilentRenewRunning()) {
              this.flowsDataService.setSilentRenewRunning();
              // Retrieve Dynamically Set Custom Params
              const customParams: { [key: string]: string | number | boolean } = this.storagePersistanceService.read(
                'storageCustomRequestParams'
              );

              if (this.flowHelper.isCurrentFlowCodeFlowWithRefreshTokens()) {
                // Refresh Session using Refresh tokens
                return this.refreshSessionRefreshTokenService.refreshSessionWithRefreshTokens(customParams);
              }

              return this.refreshSessionIframeService.refreshSessionWithIframe(customParams);
            }

            return of(null);
          })
        );
      })
    );

    this.intervalService.runTokenValidationRunning = periodicallyCheck$
      .pipe(
        catchError(() => {
          this.flowsDataService.resetSilentRenewRunning();
          return throwError('periodically check failed');
        })
      )
      .subscribe(
        () => {
          this.loggerService.logDebug('silent renew, periodic check finished!');
          if (this.flowHelper.isCurrentFlowCodeFlowWithRefreshTokens()) {
            this.flowsDataService.resetSilentRenewRunning();
          }
        },
        (err) => {
          this.loggerService.logError('silent renew failed!', err);
        }
      );
  }
}
