/**
 * core/platform.js — Detección de plataforma (web vs nativo/Capacitor).
 *
 * Permite que el MISMO código vanilla funcione tanto en el navegador (PWA)
 * como dentro del APK nativo (Capacitor). Expone:
 *   RN.platform.esNativo()        — true si corre dentro de Capacitor (Android/iOS)
 *   RN.platform.plugin(nombre)    — devuelve el plugin nativo o null
 *   RN.platform.tieneFilesystem() — true si el plugin Filesystem está disponible
 *   RN.platform.tieneContactos()  — true si hay Contact Picker (web) o plugin nativo
 *
 * Sin dependencias. Debe cargarse temprano (después de version.js).
 */
RN.platform = RN.platform || {};

/** ¿Estamos dentro de un contenedor nativo (Capacitor)? */
RN.platform.esNativo = function () {
  try {
    return !!(window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform());
  } catch (e) {
    return false;
  }
};

/** Devuelve el plugin nativo de Capacitor por nombre, o null si no existe. */
RN.platform.plugin = function (nombre) {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[nombre]) {
      return window.Capacitor.Plugins[nombre];
    }
  } catch (e) { /* ignorar */ }
  return null;
};

/** ¿Hay almacenamiento en archivo nativo (plugin Filesystem)? */
RN.platform.tieneFilesystem = function () {
  return RN.platform.esNativo() && !!RN.platform.plugin('Filesystem');
};

/** ¿Hay plugin nativo de contactos? */
RN.platform.tienePluginContactos = function () {
  return RN.platform.esNativo() && !!RN.platform.plugin('Contacts');
};

/**
 * ¿Hay alguna forma de importar contactos?
 *  - Web: Contact Picker API (navigator.contacts + ContactsManager)
 *  - Nativo: plugin @capacitor-community/contacts
 */
RN.platform.tieneContactos = function () {
  if (RN.platform.tienePluginContactos()) return true;
  return ('contacts' in navigator) && ('ContactsManager' in window);
};

/** Etiqueta legible de la plataforma (para diagnóstico/ajustes). */
RN.platform.etiqueta = function () {
  if (RN.platform.esNativo()) {
    var p = 'nativo';
    try { if (window.Capacitor.getPlatform) p = window.Capacitor.getPlatform(); } catch (e) {}
    return 'App nativa (' + p + ')';
  }
  return 'Navegador (PWA)';
};
