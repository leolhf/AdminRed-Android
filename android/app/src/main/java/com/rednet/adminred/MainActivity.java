package com.rednet.adminred;

import android.os.Bundle;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * v5.27.2 — Arranca el servicio en primer plano de AdminRed y expone el
 * estado de la app al servicio.
 *
 * Al abrir la app se lanza ForegroundService, que mantiene el proceso vivo en
 * segundo plano, publica la notificación PERMANENTE por defecto ("AdminRed
 * activo") y hace un TICK cada 30 s: refresca su notificación y, cuando la
 * app está en SEGUNDO plano, inyecta en el WebView la revisión de
 * recordatorios (RN.notify.revisarRecordatorios()).
 */
public class MainActivity extends BridgeActivity {

  /**
   * true mientras la actividad está en primer plano (onResume..onPause).
   * Lo lee el servicio para no duplicar trabajo: en primer plano los
   * temporales JS del WebView ya revisan los recordatorios.
   */
  public static volatile boolean appEnPrimerPlano = false;

  /** Referencia estática al bridge (evita fugas: se limpia en onDestroy). */
  private static Bridge puente = null;

  /** Acceso del servicio al bridge/WebView para inyectar JS. Puede ser null. */
  public static Bridge getPuente() {
    return puente;
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // El bridge se crea durante super.onCreate(); guardamos la referencia.
    puente = getBridge();
    ForegroundService.start(this);
  }

  @Override
  protected void onResume() {
    super.onResume();
    appEnPrimerPlano = true;
  }

  @Override
  protected void onPause() {
    appEnPrimerPlano = false;
    super.onPause();
  }

  @Override
  public void onDestroy() {
    if (puente != null && puente.getActivity() == this) puente = null;
    super.onDestroy();
  }
}
