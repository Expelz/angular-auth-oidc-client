import { Injectable } from '@angular/core';
import { BroadcastChannel, createLeaderElection, LeaderElector } from 'broadcast-channel';
import { Observable, of, ReplaySubject } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import { ConfigurationProvider } from '../config/config.provider';
import { EventTypes } from '../public-events/event-types';
import { PublicEventsService } from '../public-events/public-events.service';
import { LoggerService } from './../logging/logger.service';

@Injectable()
export class TabsSynchronizationService {
  private _isLeaderSubjectInitialized = false;
  private _elector: LeaderElector;
  private _silentRenewFinishedChannel: BroadcastChannel;
  private _silentRenewFinished$ = new ReplaySubject<boolean>(1);
  private _leaderSubjectInitialized$ = new ReplaySubject<boolean>(1);

  private _currentRandomId = `${Math.random().toString(36).substr(2, 9)}_${new Date().getUTCMilliseconds()}`;
  private _prefix: string;

  constructor(
    private readonly configurationProvider: ConfigurationProvider,
    private readonly publicEventsService: PublicEventsService,
    private readonly loggerService: LoggerService
  ) {
    this.Initialization();
  }

  public isLeaderCheck(): Promise<boolean> {
    this.loggerService.logDebug(`isLeaderCheck > prefix: ${this._prefix} > currentRandomId: ${this._currentRandomId}`);

    if (!this._isLeaderSubjectInitialized) {
      this.loggerService.logDebug(
        `isLeaderCheck > IS LEADER IS NOT INITIALIZED > prefix: ${this._prefix} > currentRandomId: ${this._currentRandomId}`
      );
      return this._leaderSubjectInitialized$
        .asObservable()
        .pipe(
          take(1),
          switchMap(() => {
            return of(this._elector.isLeader);
          })
        )
        .toPromise();
    }

    this.loggerService.logDebug(
      `isLeaderCheck > IS LEADER IS ALREADY INITIALIZED SUCCESSFULLY> prefix: ${this._prefix} > currentRandomId: ${this._currentRandomId}`
    );

    return new Promise((resolve) => {
      setTimeout(() => {
        const isLeader = this._elector.isLeader;
        this.loggerService.logWarning(
          `isLeaderCheck > prefix: ${this._prefix} > currentRandomId: ${this._currentRandomId} > inside setTimeout isLeader = ${isLeader}`
        );
        resolve(isLeader);
      }, 1000);
    });
  }

  public getSilentRenewFinishedObservable(): Observable<boolean> {
    return this._silentRenewFinished$.asObservable();
  }

  public sendSilentRenewFinishedNotification() {
    if (!this._silentRenewFinishedChannel) {
      this._silentRenewFinishedChannel = new BroadcastChannel(`${this._prefix}_silent_renew_finished`);
    }

    this._silentRenewFinishedChannel.postMessage(`Silent renew finished by _currentRandomId ${this._currentRandomId}`);
  }

  private Initialization(): void {
    this.loggerService.logDebug('TabsSynchronizationService > Initialization started');
    this._prefix = this.configurationProvider.openIDConfiguration?.clientId || '';
    const channel = new BroadcastChannel(`${this._prefix}_leader`);

    this._elector = createLeaderElection(channel, {
      fallbackInterval: 2000, // optional configuration for how often will renegotiation for leader occur
      responseTime: 1000, // optional configuration for how long will instances have to respond
    });

    this._elector.awaitLeadership().then(() => {
      if (!this._isLeaderSubjectInitialized) {
        this._isLeaderSubjectInitialized = true;
        this._leaderSubjectInitialized$.next(true);
      }

      this.loggerService.logDebug(`this tab is now leader > prefix: ${this._prefix} > currentRandomId: ${this._currentRandomId}`);
    });

    this.initializeSilentRenewFinishedChannelWithHandler();
  }

  private initializeSilentRenewFinishedChannelWithHandler(): void {
    this._silentRenewFinishedChannel = new BroadcastChannel(`${this._prefix}_silent_renew_finished`);
    this._silentRenewFinishedChannel.onmessage = () => {
      this.loggerService.logDebug(
        `FROM SILENT RENEW FINISHED RECIVED EVENT > prefix: ${this._prefix} > currentRandomId: ${this._currentRandomId}`
      );
      this._silentRenewFinished$.next(true);
      this.publicEventsService.fireEvent(EventTypes.SilentRenewFinished, true);
    };
  }
}
