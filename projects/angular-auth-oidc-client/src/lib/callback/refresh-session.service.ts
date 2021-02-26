import { Injectable } from '@angular/core';
import { forkJoin, from, Observable, of, throwError, TimeoutError } from 'rxjs';
import { catchError, map, switchMap, take, timeout } from 'rxjs/operators';
import { AuthStateService } from '../authState/auth-state.service';
import { AuthWellKnownService } from '../config/auth-well-known.service';
import { ConfigurationProvider } from '../config/config.provider';
import { FlowsDataService } from '../flows/flows-data.service';
import { RefreshSessionIframeService } from '../iframe/refresh-session-iframe.service';
import { SilentRenewService } from '../iframe/silent-renew.service';
import { LoggerService } from '../logging/logger.service';
import { FlowHelper } from '../utils/flowHelper/flow-helper.service';
import { TabsSynchronizationService } from './../iframe/tabs-synchronization.service';
import { RefreshSessionRefreshTokenService } from './refresh-session-refresh-token.service';

export const MAX_RETRY_ATTEMPTS = 3;
@Injectable({ providedIn: 'root' })
export class RefreshSessionService {
  constructor(
    private flowHelper: FlowHelper,
    private configurationProvider: ConfigurationProvider,
    private flowsDataService: FlowsDataService,
    private loggerService: LoggerService,
    private silentRenewService: SilentRenewService,
    private authStateService: AuthStateService,
    private authWellKnownService: AuthWellKnownService,
    private refreshSessionIframeService: RefreshSessionIframeService,
    private refreshSessionRefreshTokenService: RefreshSessionRefreshTokenService,
    private tabsSynchronizationService: TabsSynchronizationService
  ) {}

  forceRefreshSession(customParams?: {
    [key: string]: string | number | boolean;
  }): Observable<{
    idToken: any;
    accessToken: any;
  }> {
    if (this.flowHelper.isCurrentFlowCodeFlowWithRefreshTokens()) {
      return this.startRefreshSession(customParams).pipe(
        map(() => {
          const isAuthenticated = this.authStateService.areAuthStorageTokensValid();
          if (isAuthenticated) {
            return {
              idToken: this.authStateService.getIdToken(),
              accessToken: this.authStateService.getAccessToken(),
            };
          }

          return null;
        })
      );
    }

    return this.silentRenewCase();
  }

  private silentRenewCase(
    customParams?: {
      [key: string]: string | number | boolean;
    },
    currentRetry?: number
  ): Observable<{
    idToken: any;
    accessToken: any;
  }> {
    this.loggerService.logDebug(`silentRenewCase CURRENT RETRY ATTEMPT #${currentRetry}`);
    if (currentRetry && currentRetry > MAX_RETRY_ATTEMPTS) {
      return throwError(new Error('Initializatin has been failed. Exceeded max retry attepmts.'));
    }

    return from(this.tabsSynchronizationService.isLeaderCheck()).pipe(
      take(1),
      switchMap((isLeader) => {
        if (isLeader) {
          this.loggerService.logDebug(`forceRefreshSession WE ARE LEADER`);
          return forkJoin([
            this.startRefreshSession(customParams),
            this.silentRenewService.refreshSessionWithIFrameCompleted$.pipe(take(1)),
          ]).pipe(
            timeout(this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000),
            map(([_, callbackContext]) => {
              const isAuthenticated = this.authStateService.areAuthStorageTokensValid();
              if (isAuthenticated) {
                return {
                  idToken: callbackContext?.authResult?.id_token,
                  accessToken: callbackContext?.authResult?.access_token,
                };
              }

              return null;
            }),
            catchError((error) => {
              if (error instanceof TimeoutError) {
                this.loggerService.logWarning(
                  `forceRefreshSession WE ARE LEADER > occured TIMEOUT ERROR SO WE RETRY: this.forceRefreshSession(customParams)`
                );
                if (currentRetry) {
                  currentRetry++;
                } else {
                  currentRetry = 1;
                }
                return this.silentRenewCase(customParams, currentRetry);
              }

              throw error;
            })
          );
        } else {
          this.loggerService.logDebug(`forceRefreshSession WE ARE NOT NOT NOT LEADER`);
          return this.tabsSynchronizationService.getSilentRenewFinishedObservable().pipe(
            take(1),
            timeout(this.configurationProvider.openIDConfiguration.silentRenewTimeoutInSeconds * 1000),
            catchError((error) => {
              if (error instanceof TimeoutError) {
                this.loggerService.logWarning(
                  `forceRefreshSession WE ARE NOT NOT NOT LEADER > occured TIMEOUT ERROR SO WE RETRY: this.forceRefreshSession(customParams)`
                );
                if (currentRetry) {
                  currentRetry++;
                } else {
                  currentRetry = 1;
                }
                return this.silentRenewCase(customParams, currentRetry);
              }

              throw error;
            }),
            map(() => {
              const isAuthenticated = this.authStateService.areAuthStorageTokensValid();
              this.loggerService.logDebug(
                `forceRefreshSession WE ARE NOT NOT NOT LEADER > getSilentRenewFinishedObservable EMMITS VALUE > isAuthenticated = ${isAuthenticated}`
              );
              if (isAuthenticated) {
                return {
                  idToken: this.authStateService.getIdToken(),
                  accessToken: this.authStateService.getAccessToken(),
                };
              }

              this.loggerService.logError(
                `forceRefreshSession WE ARE NOT NOT NOT LEADER > getSilentRenewFinishedObservable EMMITS VALUE > isAuthenticated FALSE WE DONT KNOW WAHT TO DO WITH THIS`
              );
              return null;
            })
          );
        }
      })
    );
  }

  private startRefreshSession(customParams?: { [key: string]: string | number | boolean }) {
    const isSilentRenewRunning = this.flowsDataService.isSilentRenewRunning();
    this.loggerService.logDebug(`Checking: silentRenewRunning: ${isSilentRenewRunning}`);
    const shouldBeExecuted = !isSilentRenewRunning;

    if (!shouldBeExecuted) {
      return of(null);
    }

    const authWellknownEndpointAdress = this.configurationProvider.openIDConfiguration?.authWellknownEndpoint;

    if (!authWellknownEndpointAdress) {
      this.loggerService.logError('no authwellknownendpoint given!');
      return of(null);
    }

    return this.authWellKnownService.getAuthWellKnownEndPoints(authWellknownEndpointAdress).pipe(
      switchMap(() => {
        this.flowsDataService.setSilentRenewRunning();

        if (this.flowHelper.isCurrentFlowCodeFlowWithRefreshTokens()) {
          // Refresh Session using Refresh tokens
          return this.refreshSessionRefreshTokenService.refreshSessionWithRefreshTokens(customParams);
        }

        return this.refreshSessionIframeService.refreshSessionWithIframe(customParams);
      })
    );
  }

  // private timeoutRetryStrategy(errorAttempts: Observable<any>) {
  //   return errorAttempts.pipe(
  //     mergeMap((error, index) => {
  //       const scalingDuration = 1000;
  //       const currentAttempt = index + 1;

  //       if (!(error instanceof TimeoutError) || currentAttempt > MAX_RETRY_ATTEMPTS) {
  //         return throwError(error);
  //       }

  //       this.loggerService.logDebug(`forceRefreshSession timeout. Attempt #${currentAttempt}`);

  //       this.flowsDataService.resetSilentRenewRunning();
  //       return timer(currentAttempt * scalingDuration);
  //     })
  //   );
  // }
}
