import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { PopupOptions } from './popup-options';

@Injectable({ providedIn: 'root' })
export class PopUpServiceMock {
  get receivedUrl$() {
    return of(null);
  }

  hasPopup() {
    return true;
  }

  openPopUp(url: string, popupOptions?: PopupOptions) {}

  sendMessageToMainWindow(url: string) {}
}
