package com.rednet.adminred;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * v5.27.0 — Relanza el servicio en primer plano tras reiniciar el equipo.
 *
 * Con RECEIVE_BOOT_COMPLETED, cuando el teléfono se apaga/enciende el servicio
 * de AdminRed (y su notificación permanente por defecto) vuelve a arrancar
 * automáticamente sin abrir la app.
 */
public class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
      ForegroundService.start(context);
    }
  }
}
