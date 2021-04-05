import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthStateService } from '../authState/auth-state.service';
import { AuthorizedState } from '../authState/authorized-state';
import { ImplicitFlowCallbackService } from '../callback/implicit-flow-callback.service';
import { IntervallService } from '../callback/intervall.service';
import { ConfigurationProvider } from '../config/config.provider';
import { CallbackContext } from '../flows/callback-context';
import { FlowsDataService } from '../flows/flows-data.service';
import { FlowsService } from '../flows/flows.service';
import { LoggerService } from '../logging/logger.service';
import { FlowHelper } from '../utils/flowHelper/flow-helper.service';
import { ValidationResult } from '../validation/validation-result';
import { IFrameService } from './existing-iframe.service';
import { TabsSynchronizationService } from './tabs-synchronization.service';

const IFRAME_FOR_SILENT_RENEW_IDENTIFIER = 'myiFrameForSilentRenew';

@Injectable()
export class SilentRenewService {
  private refreshSessionWithIFrameCompletedInternal$ = new Subject<CallbackContext>();

  get refreshSessionWithIFrameCompleted$() {
    return this.refreshSessionWithIFrameCompletedInternal$.asObservable();
  }

  constructor(
    private configurationProvider: ConfigurationProvider,
    private iFrameService: IFrameService,
    private flowsService: FlowsService,
    private flowsDataService: FlowsDataService,
    private authStateService: AuthStateService,
    private loggerService: LoggerService,
    private flowHelper: FlowHelper,
    private implicitFlowCallbackService: ImplicitFlowCallbackService,
    private intervallService: IntervallService,
    private tabsSynchronizationService: TabsSynchronizationService
  ) {}

  getOrCreateIframe(): HTMLIFrameElement {
    const existingIframe = this.getExistingIframe();

    if (!existingIframe) {
      return this.iFrameService.addIFrameToWindowBody(IFRAME_FOR_SILENT_RENEW_IDENTIFIER);
    }

    return existingIframe;
  }

  isSilentRenewConfigured() {
    return !this.configurationProvider.openIDConfiguration.useRefreshToken && this.configurationProvider.openIDConfiguration.silentRenew;
  }

  codeFlowCallbackSilentRenewIframe(urlParts) {
    const params = new HttpParams({
      fromString: urlParts[1],
    });

    const error = params.get('error');

    if (error) {
      this.authStateService.updateAndPublishAuthState({
        authorizationState: AuthorizedState.Unauthorized,
        validationResult: ValidationResult.LoginRequired,
        isRenewProcess: true,
      });
      this.flowsService.resetAuthorizationData();
      this.flowsDataService.setNonce('');
      this.intervallService.stopPeriodicallTokenCheck();
      return throwError(error);
    }

    const code = params.get('code');
    const state = params.get('state');
    const sessionState = params.get('session_state');

    const callbackContext = {
      code,
      refreshToken: null,
      state,
      sessionState,
      authResult: null,
      isRenewProcess: true,
      jwtKeys: null,
      validationResult: null,
      existingIdToken: null,
    };

    return this.flowsService.processSilentRenewCodeFlowCallback(callbackContext).pipe(
      catchError((errorFromFlow) => {
        if (errorFromFlow instanceof HttpErrorResponse && errorFromFlow.status === 504) {
          this.loggerService.logError(
            'processSilentRenewCodeFlowCallback catchError statement re-throw error without any reset. Original error ' + errorFromFlow
          );
          return throwError(errorFromFlow);
        }
        this.intervallService.stopPeriodicallTokenCheck();
        this.flowsService.resetAuthorizationData();
        return throwError(errorFromFlow);
      })
    );
  }

  silentRenewEventHandler(e: CustomEvent) {
    this.loggerService.logDebug('silentRenewEventHandler');
    if (!e.detail) {
      return;
    }

    const urlParts = e.detail.toString().split('?');
    const params = new HttpParams({
      fromString: urlParts[1],
    });

    const stateFromUrl = params.get('state');
    const currentState = this.flowsDataService.getAuthStateControl();

    if (stateFromUrl !== currentState) {
      this.loggerService.logError(
        `silentRenewEventHandler > states don't match stateFromUrl: ${stateFromUrl} currentState: ${currentState}`
      );

      return;
    }

    this.tabsSynchronizationService.isLeaderCheck().then((isLeader) => {
      if (!isLeader) return;

      let callback$ = of(null);

      const isCodeFlow = this.flowHelper.isCurrentFlowCodeFlow();

      if (isCodeFlow) {
        callback$ = this.codeFlowCallbackSilentRenewIframe(urlParts);
      } else {
        callback$ = this.implicitFlowCallbackService.authorizedImplicitFlowCallback(e.detail);
      }

      callback$.subscribe(
        (callbackContext) => {
          if (callbackContext?.validationResult?.state === ValidationResult.StatesDoNotMatch) {
            this.loggerService.logError(
              `silentRenewEventHandler > inside subscribe for codeRequestCallback > states don't match stateFromUrl: ${stateFromUrl} currentState: ${currentState}`
            );

            return;
          }

          this.refreshSessionWithIFrameCompletedInternal$.next(callbackContext);
          this.flowsDataService.resetSilentRenewRunning();
          this.tabsSynchronizationService.sendSilentRenewFinishedNotification();
        },
        (err: any) => {
          if (err instanceof HttpErrorResponse && err.status === 504) {
            this.loggerService.logError(
              'silentRenewEventHandler from Callback catch timeout error so we finish this process. Original error ' + err
            );
            return;
          }
          this.loggerService.logError('Error: ' + err);
          this.refreshSessionWithIFrameCompletedInternal$.next(null);
          this.flowsDataService.resetSilentRenewRunning();
        }
      );
    });
  }

  private getExistingIframe() {
    return this.iFrameService.getExistingIFrame(IFRAME_FOR_SILENT_RENEW_IDENTIFIER);
  }
}
