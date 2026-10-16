#!/usr/bin/env bash
# Compila la app de Android de Finanzas GEMB. Uso: ./compilar.sh assembleRelease (APK) o bundleRelease (AAB)
# Java y el SDK de Android estan en C:\Android (instalados el 5/10/2026).
# La carpeta temporal corta evita "Unable to establish loopback connection"
# (Java en Windows falla con la carpeta temporal larga del usuario).
mkdir -p /c/Android/tmp
export JAVA_HOME="C:/Android/jdk17"
export ANDROID_HOME="C:/Android/Sdk"
export PATH="/c/Android/jdk17/bin:$PATH"
export TMP="C:\Android\tmp" TEMP="C:\Android\tmp"
export GRADLE_OPTS="-Djdk.net.unixdomain.tmpdir=C:/Android/tmp -Djava.io.tmpdir=C:/Android/tmp"
export JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/Android/tmp"
cd "$(dirname "$0")"
exec ./gradlew --no-daemon "$@"
