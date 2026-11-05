package com.rednet.adminred;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import com.getcapacitor.Bridge;

import java.lang.ref.WeakReference;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * v5.27.2 — Servicio en PRIMER PLANO de AdminRed con TICK de 30 segundos.
 *
 * Además de la notificación permanente por defecto ("AdminRed activo"), cada
 * 30 SEGUNDOS el servicio:
 *   1. Refresca su notificación permanente (hora de la última revisión),
 *      lo que mantiene vivo el servicio y visibile el pulso del watchdog.
 *   2. Mantiene un PARTIAL_WAKE_LOCK para que la CPU no hiberne (Doze).
 *   3. Si la app está en SEGUNDO plano, inyecta en el WebView la llamada a
 *      RN.notify.revisarRecordatorios(), que re-publica los avisos de clientes
 *      sin acción en el día y reprograma los avisos de fondo.
 *
 * Resultado: el proceso despierta cada 30 s y Android (ni los fabricantes) no
 * puede congelarlo sin que se recupere en el siguiente tick (además de
 * START_STICKY, que lo recrea si el sistema lo mata).
 *
 * NOTA de batería: un despertar cada 30 s + wake lock parcial consume más
 * batería que un FGS solo. Es el precio de garantizar que los recordatorios
 * nunca se detengan.
 */
public class ForegroundService extends Service {

  /** Identificador del canal nativo de servicio (importancia baja). */
  public static final String CANAL_SERVICIO = "adminred-servicio";

  /** ID de la notificación permanente del servicio. */
  private static final int NOTIF_ID = 1500;

  /** Intervalo del tick de mantenimiento: 30 segundos. */
  private static final long TICK_MS = 30_000L;

  private final Handler handler = new Handler(Looper.getMainLooper());
  private PowerManager.WakeLock wakeLock;
  private boolean tickCorriendo = false;

  /**
   * v5.27.3: true mientras el servicio está activo (onCreate..onDestroy).
   * Lo lee ReinicioReceiver (watchdog por alarma) para relanzar el servicio
   * sólo cuando de verdad murió.
   */
  public static volatile boolean estaCorriendo = false;

  /** Tarea periódica: refresca notificación + pide revisión de recordatorios al WebView. */
  private final Runnable tick = new Runnable() {
    @Override
    public void run() {
      try {
        refrescarNotificacion();

        // 3) Solo cuando la app está en SEGUNDO plano (en primer plano los
        // temporales JS del WebView ya funcionan; no duplicar trabajo).
        if (!MainActivity.appEnPrimerPlano) {
          Bridge b = MainActivity.getPuente();
          if (b != null && b.getWebView() != null) {
            b.getWebView().post(new Runnable() {
              @Override
              public void run() {
                try {
                  b.getWebView().evaluateJavascript(
                      "try{RN.notify.revisarRecordatorios&&RN.notify.revisarRecordatorios()}catch(e){}",
                      null);
                } catch (Exception e) { /* WebView aún no listo */ }
              }
            });
          }
        }
      } catch (Exception e) { /* nunca tumbar el servicio */ }
      handler.postDelayed(this, TICK_MS);
    }
  };

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
    estaCorriendo = true;
    crearCanal();
    adquirirWakeLock();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    Notification n = construirNotificacion();
    // Con el tipo explícito evitamos el crash "MissingForegroundServiceType"
    // en Android 14 (API 34), donde el tipo del manifest se exige también aquí.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    } else {
      startForeground(NOTIF_ID, n);
    }
    iniciarTick();
    // START_STICKY: si el sistema mata el proceso, el servicio se recrea.
    return START_STICKY;
  }

  /**
   * v5.27.3: el usuario deslizó la app de recientes (HyperOS/MIUI mata el
   * proceso justo después). Antes de morir, rearmamos la alarma del watchdog
   * (vive en el AlarmManager del SISTEMA y sobrevive a la muerte del proceso):
   * en ≤60 s ReinicioReceiver relanzará el servicio con su notificación.
   */
  @Override
  public void onTaskRemoved(Intent rootIntent) {
    KeepAlivePlugin.programarReinicio(this);
    super.onTaskRemoved(rootIntent);
  }

  /** Wake lock parcial: impide que la CPU hiberne (Doze) entre ticks. */
  private void adquirirWakeLock() {
    try {
      PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
      if (pm != null) {
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AdminRed:ServicioSegundoPlano");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(); // se libera en onDestroy()
      }
    } catch (Exception e) { /* sin wake lock el FGS sigue funcionando */ }
  }

  /** Arranca el bucle de 30 s (idempotente). */
  private void iniciarTick() {
    if (tickCorriendo) return;
    tickCorriendo = true;
    handler.postDelayed(tick, TICK_MS);
  }

  /** Republica la notificación permanente con la hora del último pulso. */
  private void refrescarNotificacion() {
    try {
      NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      if (nm != null) {
        nm.notify(NOTIF_ID, construirNotificacion()); // setOnlyAlertOnce: sin sonido
      }
    } catch (Exception e) { /* silencioso */ }
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

    String hora = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());

    Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        ? new Notification.Builder(this, CANAL_SERVICIO)
        : new Notification.Builder(this);

    return b
        .setSmallIcon(R.drawable.ic_stat_adminred)
        .setContentTitle("AdminRed activo")
        .setContentText("Recordatorios vigilando · última revisión " + hora)
        // ongoing = true ya incluye FLAG_ONGOING_EVENT: no se descarta deslizando
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setContentIntent(pi)
        .build();
  }

  @Override
  public void onDestroy() {
    estaCorriendo = false;
    handler.removeCallbacks(tick);
    tickCorriendo = false;
    try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception e) {}
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
