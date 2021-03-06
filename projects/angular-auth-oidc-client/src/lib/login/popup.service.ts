import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { PopupOptions } from './popup-options';

@Injectable({ providedIn: 'root' })
export class PopUpService {
  private popUp: Window;
  private receivedUrlInternal$ = new Subject();

  get receivedUrl$() {
    return this.receivedUrlInternal$.asObservable();
  }

  isCurrentlyInPopup() {
    return !!window.opener && window.opener !== window;
  }

  openPopUp(url: string, popupOptions?: PopupOptions) {
    const optionsToPass = this.getOptions(popupOptions);
    this.popUp = window.open(url, '_blank', optionsToPass);

    const listener = (event: MessageEvent) => {
      if (!event?.data || typeof event.data !== 'string') {
        return;
      }

      this.receivedUrlInternal$.next(event.data);

      this.cleanUp(listener);
    };

    window.addEventListener('message', listener, false);
  }

  sendMessageToMainWindow(url: string) {
    if (window.opener) {
      this.sendMessage(url, window.location.href);
    }
  }

  private cleanUp(listener: any) {
    window.removeEventListener('message', listener, false);

    if (this.popUp) {
      this.popUp.close();
      this.popUp = null;
    }
  }

  private sendMessage(url: string, href: string) {
    window.opener.postMessage(url, href);
  }

  private getOptions(popupOptions?: PopupOptions) {
    const popupDefaultOptions = { width: 500, height: 500, left: 50, top: 50 };

    const options = { ...popupDefaultOptions, ...(popupOptions || {}) };

    return Object.entries(options)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join(',');
  }
}
