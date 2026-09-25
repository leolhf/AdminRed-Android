#!/usr/bin/env python3
"""
tools/sync-version.py — Fuente única de verdad de la versión de AdminRed.

El problema que resuelve: `www/js/version.js` (lo que la app CREE que es),
`android/app/build.gradle` (lo que el APK REALMENTE es, versionName/versionCode)
y `package.json` se actualizaban a mano y se desincronizaban. Con `versionCode`
repetido, Android NI SIQUIERA INSTALA el APK nuevo sobre el instalado, así que
la app nunca recibe la actualización aunque se publique.

Uso:
    python3 tools/sync-version.py            # sincroniza gradle, package.json y version.json
    python3 tools/sync-version.py --print    # solo muestra los valores calculados
    python3 tools/sync-version.py --check    # verifica (exit 1 si hay desincronía)

Regla del versionCode (la que ya usaba el proyecto): concatenar mayor, menor y
parche → 5.29.0 = 5290, 5.31.0 = 5310, 5.13.10 = 51310. Se comprueba además que
nunca decrezca, porque Android exige que sea estrictamente creciente.
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION_JS = os.path.join(ROOT, 'www', 'js', 'version.js')
GRADLE = os.path.join(ROOT, 'android', 'app', 'build.gradle')
PACKAGE = os.path.join(ROOT, 'package.json')
VERSION_JSON = os.path.join(ROOT, 'version.json')

REPO = 'leolhf/AdminRed-Android'
PAQUETE = 'com.rednet.adminred'


def leer_version_js():
    """Lee APP_VERSION de www/js/version.js (la fuente única de verdad)."""
    try:
        txt = open(VERSION_JS, encoding='utf-8').read()
    except IOError:
        sys.exit('ERROR: no se encontró www/js/version.js')
    m = re.search(r"APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", txt)
    if not m:
        sys.exit('ERROR: no se pudo leer APP_VERSION en www/js/version.js')
    return m.group(1).strip()


def a_version_code(v):
    """5.31.0 -> 5310 ; 5.13.10 -> 51310 ; 5.29.0 -> 5290"""
    partes = re.findall(r'\d+', v)
    while len(partes) < 3:
        partes.append('0')
    return int(''.join(partes[:3]))


def gradle_valores():
    txt = open(GRADLE, encoding='utf-8').read()
    vc = re.search(r'versionCode\s+(\d+)', txt)
    vn = re.search(r'versionName\s+"([^"]+)"', txt)
    return (int(vc.group(1)) if vc else None, vn.group(1) if vn else None, txt)


def package_version():
    try:
        return json.load(open(PACKAGE, encoding='utf-8')).get('version')
    except (IOError, ValueError):
        return None


def json_version():
    try:
        return json.load(open(VERSION_JSON, encoding='utf-8')).get('version')
    except (IOError, ValueError):
        return None


def escribir_gradle(txt, version_code, version_name):
    txt = re.sub(r'versionCode\s+\d+', 'versionCode %d' % version_code, txt, count=1)
    txt = re.sub(r'versionName\s+"[^"]*"', 'versionName "%s"' % version_name, txt, count=1)
    open(GRADLE, 'w', encoding='utf-8').write(txt)


def escribir_package(version):
    data = json.load(open(PACKAGE, encoding='utf-8'))
    data['version'] = version
    json.dump(data, open(PACKAGE, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    open(PACKAGE, 'a', encoding='utf-8').write('\n')


def escribir_version_json(version, notas=''):
    tag = 'v' + version
    data = {
        'app': 'AdminRed',
        'paquete': PAQUETE,
        'version': version,
        'tag': tag,
        'nombre': 'AdminRed ' + tag,
        'url': 'https://github.com/%s/releases/tag/%s' % (REPO, tag),
        'apk': 'https://github.com/%s/releases/download/%s/AdminRed_%s.apk' % (REPO, tag, version),
        'releases': 'https://github.com/%s/releases' % REPO,
        'obligatoria': False,
        'repositorio': REPO,
        'notas': notas or ('APK de AdminRed %s publicado automáticamente.' % version)
    }
    json.dump(data, open(VERSION_JSON, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    open(VERSION_JSON, 'a', encoding='utf-8').write('\n')


def main():
    ap = argparse.ArgumentParser(description='Sincroniza la versión de AdminRed en todos los sitios.')
    ap.add_argument('--print', dest='solo_print', action='store_true', help='muestra los valores y no escribe nada')
    ap.add_argument('--check', action='store_true', help='verifica la coherencia (exit 1 si falla)')
    ap.add_argument('--notas', default='', help='notas que se guardan en version.json')
    args = ap.parse_args()

    version = leer_version_js()
    code = a_version_code(version)
    vc_actual, vn_actual, gtxt = gradle_valores()
    pkg = package_version()
    vjson = json_version()

    print('Versión de referencia (www/js/version.js): %s' % version)
    print('versionCode calculado:                     %d' % code)
    print('build.gradle actual:                       versionName "%s" / versionCode %s' % (vn_actual, vc_actual))
    print('package.json actual:                       %s' % pkg)
    print('version.json actual:                       %s' % vjson)

    if args.solo_print:
        return 0

    if args.check:
        fallos = []
        if vn_actual != version:
            fallos.append('build.gradle versionName "%s" != %s' % (vn_actual, version))
        if vc_actual != code:
            fallos.append('build.gradle versionCode %s != %d' % (vc_actual, code))
        if pkg != version:
            fallos.append('package.json version %s != %s' % (pkg, version))
        if vjson != version:
            fallos.append('version.json version %s != %s' % (vjson, version))
        if fallos:
            print('\nDESINCRONIZADO:')
            for f in fallos:
                print('  - ' + f)
            print('\nEjecuta: python3 tools/sync-version.py')
            return 1
        print('\nOK: las cuatro versiones coinciden (%s, versionCode %d).' % (version, code))
        return 0

    # Nunca permitir que el versionCode decrezca: Android no instala un APK con
    # un versionCode igual o menor que el instalado.
    if vc_actual is not None and code < vc_actual:
        sys.exit('ERROR: el versionCode calculado (%d) es MENOR que el actual (%d). '
                 'Sube APP_VERSION (www/js/version.js) antes de publicar.' % (code, vc_actual))

    escribir_gradle(gtxt, code, version)
    escribir_package(version)
    escribir_version_json(version, args.notas)
    print('\n✓ Sincronizado: build.gradle (%s / %d), package.json y version.json.' % (version, code))
    return 0


if __name__ == '__main__':
    sys.exit(main())
