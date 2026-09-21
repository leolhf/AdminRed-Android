package com.rednet.adminred;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * v5.27.0 — Servicio en PRIMER PLANO de AdminRed.
 *
 * Mantiene el proceso de la app vivo en segundo plano para que:
 *   - los recordatorios de cobros (notificaciones locales) se revisen y
 *     re-public aunque el usuario haya deslizado alguna,
 *   - los avisos programados cada 4 h sigan entregándose con la app cerrada.
 *
 * Muestra la notificación PERMANENTE por defecto de la APK ("AdminRed activo")
 * en un canal de importancia BAJA (sin sonido, sin molestar). Al estar ligada
 * a un servicio real en primer plano (startForeground), Android no la elimina
 * al deslizarla y no mata el proceso por ahorro de batería.
 */
public class ForegroundService extends Service {

  /** Identificador del canal nativo de servicio (importancia baja). */
  public static final String CANAL_SERVICIO = "adminred-servicio";

  /** ID de la notificación permanente del servicio. */
  private static final int NOTIF_ID = 1500;

  /**
   * Arranca el servicio de forma segura según la versión de Android.
   * Llamar SIEMPRE desde la app en primer plano (MainActivity) o desde
   * el receptor de BOOT_COMPLETED (está permitido arrancar un FGS ahí).
   */
  public static void start(Context ctx) {
    Intent i = new Intent(ctx, ForegroundService.class);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ctx.startForegroundService(i);
    } else {
      ctx.startService(i);
    }
  }

  @Override
  public void onCreate() {
    super.onCreate();
    crearCanal();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    startForeground(NOTIF_ID, construirNotificacion());
    // START_STICKY: si el sistema mata el proceso, el servicio se recrea.
    return START_STICKY;
  }

  /** Canal de importancia BAJA: la notificación permanente no suena ni vibra. */
  private void crearCanal() {
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (nm == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel ch = new NotificationChannel(
          CANAL_SERVICIO,
          "Servicio de AdminRed",
          NotificationManager.IMPORTANCE_LOW);
      ch.setDescription("Mantiene los recordatorios de cobros activos en segundo plano");
      ch.setShowBadge(false);
      nm.createNotificationChannel(ch);
    }
  }

  /** Notificación permanente ligada al servicio (no se puede deslizar). */
  private Notification construirNotificacion() {
    Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (abrir == null) abrir = new Intent(this, MainActivity.class);
    PendingIntent pi = PendingIntent.getActivity(
        this, 0, abrir, PendingIntent.FLAG_IMMUTABLE);

    Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        ? new Notification.Builder(this, CANAL_SERVICIO)
        : new Notification.Builder(this);

    return b
        .setSmallIcon(R.drawable.ic_stat_adminred)
        .setContentTitle("AdminRed activo")
        .setContentText("Recordatorios de cobros funcionando en segundo plano")
        // ongoing = true ya incluye FLAG_ONGOING_EVENT: no se descarta deslizando
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setContentIntent(pi)
        .build();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
