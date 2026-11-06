package com.rednet.adminred;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * v5.27.3 — Receptor de la ALARMA de vigilancia (watchdog).
 *
 * La alarma vive en el AlarmManager del SISTEMA, no en el proceso de la app:
 * sigue disparándose aunque HyperOS haya matado AdminRed por completo.
 * Al dispararse:
 *   1. Rearma la siguiente alarma (auto-retroalimentación, cadena infinita).
 *   2. Si el servicio en primer plano NO está corriendo, lo relanza.
 *
 * Así, aunque el usuario deslice la app de recientes en HyperOS 3 y el
 * proceso muera, en ≤60 s vuelve a levantarse con su notificación permanente.
 */
public class ReinicioReceiver extends BroadcastReceiver {

  @Override
  public void onReceive(Context context, Intent intent) {
    // 1) Rearmar la próxima alarma de vigilancia.
    KeepAlivePlugin.programarReinicio(context);
    // 2) Relanzar el servicio si murió. startForegroundService() desde un
    //    BroadcastReceiver está permitido y el servicio hace startForeground()
    //    de inmediato en onStartCommand(), cumpliendo la política de Android 12+.
    if (!ForegroundService.estaCorriendo) {
      ForegroundService.start(context);
    }
  }
}
