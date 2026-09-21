package com.rednet.adminred;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * v5.27.0 — Arranca el servicio en primer plano de AdminRed.
 *
 * Al abrir la app se lanza ForegroundService, que mantiene el proceso vivo en
 * segundo plano y publica la notificación PERMANENTE por defecto ("AdminRed
 * activo"). Así los recordatorios de cobros no desaparecen al deslizarlos y
 * los avisos programados se entregan aunque la app esté cerrada.
 */
public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    ForegroundService.start(this);
  }
}
