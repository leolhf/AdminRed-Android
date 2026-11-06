package com.rednet.adminred;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * v5.55.31 — Abre la APK de el Toque (com.elToque.tasas) para consultar la tasa.
 * No puede leer datos internos de esa app (sandbox de Android); solo la lanza
 * si está instalada. Si no, el JS abre https://eltoque.com/ como respaldo.
 */
@CapacitorPlugin(name = "ElToque")
public class ElToquePlugin extends Plugin {

  public static final String PACKAGE_ELTOQUE = "com.elToque.tasas";
  public static final String URL_WEB = "https://eltoque.com/";

  @PluginMethod
  public void estado(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("installed", isInstalled(getContext()));
    ret.put("package", PACKAGE_ELTOQUE);
    call.resolve(ret);
  }

  @PluginMethod
  public void abrir(PluginCall call) {
    Context ctx = getContext();
    JSObject ret = new JSObject();
    ret.put("package", PACKAGE_ELTOQUE);

    if (!isInstalled(ctx)) {
      ret.put("ok", false);
      ret.put("installed", false);
      ret.put("reason", "not_installed");
      call.resolve(ret);
      return;
    }

    try {
      PackageManager pm = ctx.getPackageManager();
      Intent launch = pm.getLaunchIntentForPackage(PACKAGE_ELTOQUE);
      if (launch == null) {
        ret.put("ok", false);
        ret.put("installed", true);
        ret.put("reason", "no_launcher");
        call.resolve(ret);
        return;
      }
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(launch);
      ret.put("ok", true);
      ret.put("installed", true);
      call.resolve(ret);
    } catch (Exception e) {
      ret.put("ok", false);
      ret.put("installed", true);
      ret.put("reason", "error");
      ret.put("message", e.getMessage());
      call.resolve(ret);
    }
  }

  /** Abre la ficha de la app en la tienda (si hace falta instalarla). */
  @PluginMethod
  public void abrirTienda(PluginCall call) {
    Context ctx = getContext();
    try {
      Intent market = new Intent(Intent.ACTION_VIEW,
        Uri.parse("market://details?id=" + PACKAGE_ELTOQUE));
      market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(market);
      JSObject ret = new JSObject();
      ret.put("ok", true);
      call.resolve(ret);
    } catch (Exception e) {
      try {
        Intent web = new Intent(Intent.ACTION_VIEW,
          Uri.parse("https://play.google.com/store/apps/details?id=" + PACKAGE_ELTOQUE));
        web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(web);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
      } catch (Exception e2) {
        call.reject("No se pudo abrir la tienda");
      }
    }
  }

  private static boolean isInstalled(Context ctx) {
    try {
      ctx.getPackageManager().getPackageInfo(PACKAGE_ELTOQUE, 0);
      return true;
    } catch (Exception e) {
      return false;
    }
  }
}
