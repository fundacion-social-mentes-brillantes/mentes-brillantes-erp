import java.util.Properties

plugins {
    id("com.android.application")
}

// La llave de firma vive FUERA del repositorio (C:\Android\firma): la de subida de Budget, la misma de KITS.
// Sin ella igual se compila la version de prueba (debug); la de Play no.
val archivoFirma = file(System.getenv("FINANZAS_FIRMA") ?: "C:/Android/firma/firma.properties")
val firma = Properties().apply { if (archivoFirma.exists()) archivoFirma.inputStream().use { load(it) } }

android {
    namespace = "org.fundacionsocialmentesbrillantes.finanzas"
    compileSdk = 37

    defaultConfig {
        // OJO: el nombre tecnico en Google Play no se puede cambiar despues de subir la app.
        applicationId = "org.fundacionsocialmentesbrillantes.finanzas"
        minSdk = 24
        targetSdk = 36
        // Subir versionCode en cada version que se mande a Google Play.
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        if (archivoFirma.exists()) {
            create("subida") {
                storeFile = file(firma.getProperty("storeFile"))
                storePassword = firma.getProperty("storePassword")
                keyAlias = firma.getProperty("keyAlias")
                keyPassword = firma.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Quita el codigo que no se usa de las librerias (la app pesa menos).
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (archivoFirma.exists()) signingConfig = signingConfigs.getByName("subida")
        }
    }
}

dependencies {
    // Abre Finanzas GEMB (el ERP) a pantalla completa en Chrome (Trusted Web Activity).
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
