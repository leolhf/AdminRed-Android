package com.rednet.adminred;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * v5.28.0 — Plugin nativo "GoogleDrive": copia de datos en Drive appDataFolder.
 *
 * Autenticación SIN configuración externa (sin OAuth Client ID, sin
 * google-services.json): usa la cuenta de Google ya configurada en el
 * teléfono vía AccountManager con el alcance restringido
 * "oauth2:https://www.googleapis.com/auth/drive.appdata". El primer uso
 * muestra el diálogo de consentimiento de Google; el token queda en caché
 * del sistema y se revalida solo (invalidateAuthToken + reintento ante 401).
 *
 * La copia vive en "Datos de aplicaciones ocultos" del Drive del usuario
 * (invisible para el usuario normal, privada de la app).
 *
 * API JS (plugin 'GoogleDrive'):
 *   conectar()                    → selector de cuenta → {cuenta}
 *   subir({json, cuenta})         → sube/actualiza el respaldo → {ok, fechaRemota}
 *   leer({cuenta})                → {json|null, fechaRemota}
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

  private static final String SCOPE = "oauth2:https://www.googleapis.com/auth/drive.appdata";
  private static final String FILE_NAME = "adminred-backup.json";
  private static final String BOUNDARY = "adminred_31415926535";
  private static final String API = "https://www.googleapis.com";
  private static final String TIPO_CUENTA = "com.google";

  /** Operación en curso mientras se muestra el diálogo de consentimiento. */
  private String opPendiente = null;
  private String jsonPendiente = null;

  // ---------------- API JS ----------------

  /** Abre el selector oficial de cuentas de Google (sin permiso GET_ACCOUNTS). */
  @PluginMethod
  public void conectar(PluginCall call) {
    try {
      Intent i;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        i = AccountManager.newChooseAccountIntent(
            null, null, new String[]{TIPO_CUENTA}, null, null, null, null);
      } else {
        i = AccountManager.newChooseAccountIntent(
            null, null, new String[]{TIPO_CUENTA}, false, null, null, null, null);
      }
      startActivityForResult(call, i, "pickerResult");
    } catch (Exception e) {
      resolverError(call, "No se pudo abrir el selector de cuentas: " + e.getMessage());
    }
  }

  /** Resultado del selector de cuentas. */
  @ActivityCallback
  private void pickerResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result == null || result.getData() == null) { call.reject("Selección cancelada"); return; }
    String cuenta = result.getData().getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
    if (cuenta == null) { call.reject("No se seleccionó cuenta"); return; }
    JSObject r = new JSObject();
    r.put("cuenta", cuenta);
    call.resolve(r);
  }

  /** Sube el respaldo (crea o actualiza el archivo único en appDataFolder). */
  @PluginMethod
  public void subir(PluginCall call) {
    final String json = call.getString("json");
    final String cuenta = call.getString("cuenta");
    if (json == null || json.isEmpty()) { call.reject("Falta el contenido a subir"); return; }
    if (cuenta == null || cuenta.isEmpty()) { call.reject("Sin cuenta de Google conectada"); return; }
    operar(call, "subir", json, cuenta);
  }

  /** Descarga el respaldo remoto ({json:null} si aún no existe). */
  @PluginMethod
  public void leer(PluginCall call) {
    final String cuenta = call.getString("cuenta");
    if (cuenta == null || cuenta.isEmpty()) { call.reject("Sin cuenta de Google conectada"); return; }
    operar(call, "leer", null, cuenta);
  }

  // ------- persistencia DURADERA de la cuenta (v5.28.2) -------
  // La cuenta vivía SOLO en localStorage del WebView; en algunos dispositivos
  // (HyperOS/MIUI fuerzan la detención, actualizaciones de la APK, limpieza del
  // WebView) ese almacenamiento se pierde y la "vinculación" desaparecía al
  // reabrir la app. SharedPreferences sobrevive a todo eso (salvo desinstalar).

  @PluginMethod
  public void guardarCuenta(PluginCall call) {
    String cuenta = call.getString("cuenta");
    if (cuenta == null || cuenta.isEmpty()) { call.reject("Falta la cuenta"); return; }
    getContext().getSharedPreferences("adminred_drive", Activity.MODE_PRIVATE)
        .edit().putString("cuenta", cuenta).apply();
    JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
  }

  @PluginMethod
  public void leerCuenta(PluginCall call) {
    String c = getContext().getSharedPreferences("adminred_drive", Activity.MODE_PRIVATE)
        .getString("cuenta", null);
    JSObject r = new JSObject();
    r.put("cuenta", (c != null) ? c : JSONObject.NULL);
    call.resolve(r);
  }

  @PluginMethod
  public void borrarCuenta(PluginCall call) {
    getContext().getSharedPreferences("adminred_drive", Activity.MODE_PRIVATE)
        .edit().remove("cuenta").apply();
    JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
  }

  // ---------------- motor (token + REST v3) ----------------

  /** Lanza la operación en un hilo de fondo (getToken y HTTP bloquean). */
  private void operar(final PluginCall call, final String op, final String json, final String cuenta) {
    final Thread t = new Thread(new Runnable() {
      @Override
      public void run() {
        try {
          Account acc = new Account(cuenta, TIPO_CUENTA);
          String token = obtenerToken(call, acc, op, json);
          if (token == null) return; // se fue a flujo de consentimiento
          ejecutar(call, op, json, token, acc, true);
        } catch (Exception e) {
          resolverError(call, "Drive: " + e.getMessage());
        }
      }
    });
    t.start();
  }

  /**
   * Token OAuth2 vía AccountManager (Play Services). Devuelve null si se
   * necesita consentimiento (en cuyo caso ya se lanzó el flujo y la llamada
   * seguirá tras consentResult).
   */
  private String obtenerToken(PluginCall call, Account acc, String op, String json) throws Exception {
    AccountManager am = AccountManager.get(getContext());
    Bundle b = am.getAuthToken(acc, SCOPE, null, false, null, null).getResult();
    String token = b.getString(AccountManager.KEY_AUTHTOKEN);
    if (token != null) return token;
    Intent cons = (Intent) b.get(AccountManager.KEY_INTENT);
    if (cons != null) {
      // Primera vez: pedir consentimiento con el diálogo oficial de Google.
      opPendiente = op;
      jsonPendiente = json;
      getActivity().runOnUiThread(new Runnable() {
        @Override
        public void run() {
          // Reutilizamos la MISMA call: el resultado llega a consentResult
          // con sus parámetros originales (cuenta) intactos.
          startActivityForResult(call, cons, "consentResult");
        }
      });
      return null;
    }
    throw new Exception("no se obtuvo token de Google (¿hay Play Services y sesión?)");
  }

  /** Resultado del consentimiento: reintentar la operación original. */
  @ActivityCallback
  private void consentResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result == null || result.getResultCode() != Activity.RESULT_OK) {
      resolverError(call, "Consentimiento de Google cancelado");
      return;
    }
    final String op = opPendiente; opPendiente = null;
    final String json = jsonPendiente; jsonPendiente = null;
    operar(call, op, json, call.getString("cuenta"));
  }

  private void ejecutar(final PluginCall call, final String op, final String json,
                        final String token, final Account acc, final boolean permitirRetry) {
    try {
      if ("subir".equals(op)) subirImpl(call, json, token, acc, permitirRetry);
      else leerImpl(call, token, acc, permitirRetry);
    } catch (final Exception e) {
      resolverError(call, "Drive: " + e.getMessage());
    }
  }

  /** Busca el id del respaldo existente en appDataFolder (o null). */
  private String buscarFileId(String token) throws Exception {
    String q = URLEncoder.encode("name='" + FILE_NAME + "'", "UTF-8");
    String url = API + "/drive/v3/files?spaces=appDataFolder&q=" + q + "&fields=files(id,name)";
    HttpURLConnection cnx = abrir(url, token, "GET");
    int code = cnx.getResponseCode();
    String body = leerCuerpo(cnx);
    if (code != 200) throw new Exception("búsqueda HTTP " + code + ": " + recortar(body));
    JSONObject o = new JSONObject(body);
    JSONArray files = o.optJSONArray("files");
    if (files != null && files.length() > 0) return files.getJSONObject(0).getString("id");
    return null;
  }

  private void subirImpl(PluginCall call, String json, String token, Account acc, boolean permitirRetry) throws Exception {
    String fileId = buscarFileId(token);
    byte[] meta = ("{\"name\":\"" + FILE_NAME + "\"}").getBytes(StandardCharsets.UTF_8);
    byte[] data = json.getBytes(StandardCharsets.UTF_8);
    byte[] pre = ("--" + BOUNDARY + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").getBytes(StandardCharsets.UTF_8);
    byte[] mid = ("\r\n--" + BOUNDARY + "\r\nContent-Type: application/json\r\n\r\n").getBytes(StandardCharsets.UTF_8);
    byte[] fin = ("\r\n--" + BOUNDARY + "--").getBytes(StandardCharsets.UTF_8);
    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
    bos.write(pre); bos.write(meta); bos.write(mid); bos.write(data); bos.write(fin);
    byte[] body = bos.toByteArray();

    String urlStr = (fileId != null)
        ? API + "/upload/drive/v3/files/" + fileId + "?uploadType=multipart&fields=modifiedTime"
        : API + "/upload/drive/v3/files?uploadType=multipart&fields=modifiedTime";
    HttpURLConnection cnx = (HttpURLConnection) new URL(urlStr).openConnection();
    cnx.setRequestMethod(fileId != null ? "PATCH" : "POST");
    cnx.setRequestProperty("Authorization", "Bearer " + token);
    cnx.setRequestProperty("Content-Type", "multipart/related; boundary=" + BOUNDARY);
    cnx.setDoOutput(true);
    OutputStream os = cnx.getOutputStream();
    os.write(body);
    os.close();

    int code = cnx.getResponseCode();
    if (code == 401 && permitirRetry) {
      // Token vencido: invalidarlo en caché y reintentar UNA vez.
      AccountManager.get(getContext()).invalidateAuthToken(TIPO_CUENTA, token);
      String t2 = obtenerToken(call, acc, "subir", json);
      if (t2 == null) return;
      subirImpl(call, json, t2, acc, false);
      return;
    }
    String resp = leerCuerpo(cnx);
    if (code < 200 || code >= 300) throw new Exception("subida HTTP " + code + ": " + recortar(resp));
    String fecha = null;
    try { fecha = new JSONObject(resp).optString("modifiedTime", null); } catch (Exception ig) {}
    JSObject r = new JSObject();
    r.put("ok", true);
    if (fecha != null) r.put("fechaRemota", fecha);
    resolver(call, r);
  }

  private void leerImpl(PluginCall call, String token, Account acc, boolean permitirRetry) throws Exception {
    String fileId = buscarFileId(token);
    if (fileId == null) {
      JSObject r = new JSObject();
      r.put("json", JSONObject.NULL); // aún no hay copia en la nube
      resolver(call, r);
      return;
    }
    HttpURLConnection cnx = abrir(API + "/drive/v3/files/" + fileId + "?alt=media", token, "GET");
    int code = cnx.getResponseCode();
    if (code == 401 && permitirRetry) {
      AccountManager.get(getContext()).invalidateAuthToken(TIPO_CUENTA, token);
      String t2 = obtenerToken(call, acc, "leer", null);
      if (t2 == null) return;
      leerImpl(call, t2, acc, false);
      return;
    }
    String contenido = leerCuerpo(cnx);
    if (code != 200) throw new Exception("descarga HTTP " + code + ": " + recortar(contenido));

    HttpURLConnection c2 = abrir(API + "/drive/v3/files/" + fileId + "?fields=modifiedTime", token, "GET");
    String metaResp = leerCuerpo(c2);
    String fecha = null;
    try { fecha = new JSONObject(metaResp).optString("modifiedTime", null); } catch (Exception ig) {}

    JSObject r = new JSObject();
    r.put("json", contenido);
    if (fecha != null) r.put("fechaRemota", fecha);
    resolver(call, r);
  }

  // ---------------- utilidades ----------------

  private HttpURLConnection abrir(String url, String token, String metodo) throws Exception {
    HttpURLConnection cnx = (HttpURLConnection) new URL(url).openConnection();
    cnx.setRequestMethod(metodo);
    cnx.setRequestProperty("Authorization", "Bearer " + token);
    cnx.setConnectTimeout(20000);
    cnx.setReadTimeout(30000);
    return cnx;
  }

  private String leerCuerpo(HttpURLConnection cnx) throws Exception {
    try {
      return _leer(cnx.getInputStream());
    } catch (Exception e) {
      try { return _leer(cnx.getErrorStream()); } catch (Exception ig) { return ""; }
    }
  }

  private String _leer(java.io.InputStream is) throws Exception {
    if (is == null) return "";
    BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder();
    String linea;
    while ((linea = br.readLine()) != null) sb.append(linea);
    br.close();
    return sb.toString();
  }

  private String recortar(String s) {
    if (s == null) return "";
    return s.length() > 200 ? s.substring(0, 200) : s;
  }

  private void resolver(final PluginCall call, final JSObject r) {
    if (getActivity() != null) {
      getActivity().runOnUiThread(new Runnable() {
        @Override public void run() { if (!call.isReleased()) call.resolve(r); }
      });
    } else if (!call.isReleased()) {
      call.resolve(r);
    }
  }

  private void resolverError(final PluginCall call, final String msg) {
    if (getActivity() != null) {
      getActivity().runOnUiThread(new Runnable() {
        @Override public void run() { if (!call.isReleased()) call.reject(msg); }
      });
    } else if (!call.isReleased()) {
      call.reject(msg);
    }
  }
}
