package com.rednet.adminred;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * v5.27.3 — Plugin nativo "KeepAlive": red de seguridad anti-muerte del proceso.
 *
 * HyperOS 3 (Xiaomi, Android 16) mata el proceso de la app al deslizarla de
 * recientes aunque tenga un servicio en primer plano. Este plugin añade dos
 * defensas:
 *
 *   1. WATCHDOG por ALARMA EXACTA: una alarma del sistema (sobrevive a la
 *      muerte del proceso, no vive en él) que cada 60 s comprueba si el
 *      servicio sigue vivo; si no, lo relanza. En Android 12+ los FGS
 *      lanzados desde alarmas exactas están entre las excepciones oficiales
 *      cuando se concede "Alarmas y recordatorios" (SCHEDULE_EXACT_ALARM,
 *      ya declarada y pedida al usuario en la app).
 *   2. EXENCIÓN de optimización de batería: lanza el diálogo oficial de
 *      Android (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) para sacar a
 *      AdminRed de la lista de apps optimizables.
 *
 * Además expone la programación como método estático para que el servicio
 * (onTaskRemoved) y MainActivity la rearmen en cada arranque.
 */
@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {

  /** Código de la alarma de vigilancia. */
  private static final int ALARMA_RC = 2200;

  /** Periodo del watchdog: 60 segundos. */
  private static final long WATCHDOG_MS = 60_000L;

  /**
   * Programa (o rearma) la alarma del watchdog. Idempotente: con
   * FLAG_UPDATE_CURRENT cada llamada sustituye la alarma anterior.
   * Llamado desde MainActivity.onCreate, onTaskRemoved del servicio y el
   * propio receptor (auto-retroalimentación).
   */
  public static void programarReinicio(Context ctx) {
    try {
      AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
      if (am == null) return;
      Intent i = new Intent(ctx, ReinicioReceiver.class);
      PendingIntent pi = PendingIntent.getBroadcast(
          ctx, ALARMA_RC, i,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      long at = System.currentTimeMillis() + WATCHDOG_MS;
      boolean exactas = false;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        try { exactas = am.canScheduleExactAlarms(); } catch (Exception e) { exactas = false; }
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && exactas) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
      } else {
        // Sin "Alarmas y recordatorios": alarma inexacta (puede retrasarse en
        // Doze, pero sigue siendo una red de seguridad válida).
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
      }
    } catch (Exception e) { /* nunca tumbar la app por esto */ }
  }

  /** Método JS: KeepAlive.programarReinicio() — rearma el watchdog a mano. */
  @PluginMethod
  public void programarReinicio(PluginCall call) {
    programarReinicio(getContext());
    call.resolve();
  }

  /**
   * Método JS: KeepAlive.pedirExencionBateria()
   * Lanza el diálogo oficial de Android para excluir a AdminRed de la
   * optimización de batería. Si ya está concedida, no muestra nada.
   */
  @PluginMethod
  public void pedirExencionBateria(PluginCall call) {
    try {
      PowerManager pm = (PowerManager) getActivity()
          .getSystemService(Context.POWER_SERVICE);
      String pkg = getContext().getPackageName();
      if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
        JSObject r = new JSObject();
        r.put("yaConcedida", true);
        call.resolve(r);
        return;
      }
      Intent i = new Intent(
          Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          Uri.parse("package:" + pkg));
      getContext().startActivity(i);
      JSObject r = new JSObject();
      r.put("solicitada", true);
      call.resolve(r);
    } catch (Exception e) {
      call.resolve(); // sin el diálogo, la red de seguridad de la alarma sigue
    }
  }
}