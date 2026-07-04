const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Kotlin sources generated into the app package. Kept in sync with the
// committed files under android/ — prebuild rewrites them from here.
function appFirebaseMessagingServiceKt(pkg) {
  return `package ${pkg}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import com.twiliovoicereactnative.VoiceFirebaseMessagingService

/**
 * Single FCM entry point for the app. Android delivers push messages to only
 * ONE FirebaseMessagingService, so this subclass replaces Twilio's built-in
 * service (disabled via twilio_config.xml): Twilio Voice call pushes are
 * forwarded to the SDK via super, SMS pushes from our backend are shown as
 * notifications here.
 */
class AppFirebaseMessagingService : VoiceFirebaseMessagingService() {

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (data["type"] == "sms") {
      showSmsNotification(data)
    } else {
      super.onMessageReceived(remoteMessage)
    }
  }

  private fun showSmsNotification(data: Map<String, String>) {
    val number = data["number"] ?: "Unknown"
    val title = data["name"]?.takeIf { it.isNotBlank() } ?: number
    val body = data["body"]?.takeIf { it.isNotBlank() } ?: "New message"

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Messages",
        NotificationManager.IMPORTANCE_HIGH
      ).apply { description = "Incoming SMS messages" }
      manager.createNotificationChannel(channel)
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      putExtra("smsNumber", number)
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      number.hashCode(),
      launchIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    // One notification per sender number — a newer SMS from the same number
    // replaces the previous notification instead of stacking endlessly.
    manager.notify(number.hashCode(), notification)
  }

  companion object {
    private const val CHANNEL_ID = "sms_messages"
  }
}
`;
}

function fcmTokenModuleKt(pkg) {
  return `package ${pkg}

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.messaging.FirebaseMessaging

/** Exposes the device's FCM registration token to JS (NativeModules.FcmToken). */
class FcmTokenModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "FcmToken"

  @ReactMethod
  fun getToken(promise: Promise) {
    FirebaseMessaging.getInstance().token
      .addOnSuccessListener { token -> promise.resolve(token) }
      .addOnFailureListener { e -> promise.reject("fcm_token_error", e.message, e) }
  }
}
`;
}

function fcmTokenPackageKt(pkg) {
  return `package ${pkg}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FcmTokenPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(FcmTokenModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
`;
}

function withTwilioVoice(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const root = config.modRequest.platformProjectRoot;
      const pkg = config.android.package;
      const javaDir = path.join(root, 'app', 'src', 'main', 'java', ...pkg.split('.'));
      const mainAppPath = path.join(javaDir, 'MainApplication.kt');

      let contents = fs.readFileSync(mainAppPath, 'utf8');

      // Add imports
      if (!contents.includes('VoiceApplicationProxy')) {
        contents = contents.replace(
          'import android.app.Application',
          `import android.app.Application\nimport com.twiliovoicereactnative.VoiceApplicationProxy`
        );
      }

      // Add VoiceApplicationProxy field after class declaration
      if (!contents.includes('voiceApplicationProxy')) {
        contents = contents.replace(
          'class MainApplication : Application(), ReactApplication {',
          `class MainApplication : Application(), ReactApplication {\n\n  private lateinit var voiceApplicationProxy: VoiceApplicationProxy`
        );
      }

      // Add voiceApplicationProxy initialization and onCreate() right after super.onCreate()
      if (!contents.includes('voiceApplicationProxy.onCreate')) {
        contents = contents.replace(
          'super.onCreate()',
          `super.onCreate()\n    voiceApplicationProxy = VoiceApplicationProxy(this)\n    voiceApplicationProxy.onCreate()`
        );
      }

      // Add onTerminate before onConfigurationChanged
      if (!contents.includes('voiceApplicationProxy.onTerminate')) {
        contents = contents.replace(
          '  override fun onConfigurationChanged',
          `  override fun onTerminate() {\n    super.onTerminate()\n    voiceApplicationProxy.onTerminate()\n  }\n\n  override fun onConfigurationChanged`
        );
      }

      // Register the FCM token native module
      if (!contents.includes('add(FcmTokenPackage())')) {
        contents = contents.replace(
          '// add(MyReactNativePackage())',
          `// add(MyReactNativePackage())\n          add(FcmTokenPackage())`
        );
      }

      fs.writeFileSync(mainAppPath, contents, 'utf8');

      // twilio_config.xml — DISABLE Twilio's own Firebase messaging service;
      // AppFirebaseMessagingService (below) is the single FCM handler and
      // forwards Twilio Voice pushes to the SDK via super.
      const valuesDir = path.join(root, 'app', 'src', 'main', 'res', 'values');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.writeFileSync(path.join(valuesDir, 'twilio_config.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <!-- Disabled: AppFirebaseMessagingService (subclass) is the single FCM
       handler — it forwards Twilio Voice pushes to the SDK via super and
       shows SMS notifications itself. -->
  <bool name="twiliovoicereactnative_firebasemessagingservice_enabled">false</bool>
</resources>
`, 'utf8');

      // Generate the Kotlin sources for the FCM service + token module
      fs.writeFileSync(path.join(javaDir, 'AppFirebaseMessagingService.kt'), appFirebaseMessagingServiceKt(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'FcmTokenModule.kt'), fcmTokenModuleKt(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'FcmTokenPackage.kt'), fcmTokenPackageKt(pkg), 'utf8');

      // Declare the FCM service in AndroidManifest.xml
      const manifestPath = path.join(root, 'app', 'src', 'main', 'AndroidManifest.xml');
      let manifest = fs.readFileSync(manifestPath, 'utf8');
      if (!manifest.includes('AppFirebaseMessagingService')) {
        manifest = manifest.replace(
          '<activity android:name=".MainActivity"',
          `<service android:name=".AppFirebaseMessagingService" android:exported="false" android:stopWithTask="false">
      <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT"/>
      </intent-filter>
    </service>
    <activity android:name=".MainActivity"`
        );
        fs.writeFileSync(manifestPath, manifest, 'utf8');
      }

      // Add firebase-messaging so the app module compiles against FCM classes
      const gradlePath = path.join(root, 'app', 'build.gradle');
      let gradle = fs.readFileSync(gradlePath, 'utf8');
      if (!gradle.includes('com.google.firebase:firebase-messaging')) {
        gradle = gradle.replace(
          'implementation("com.facebook.react:react-android")',
          `implementation("com.facebook.react:react-android")

    // FCM — AppFirebaseMessagingService + FcmTokenModule compile against this
    // (the Twilio SDK's copy is \`implementation\`-scoped, so not visible here).
    // Version matches @twilio/voice-react-native-sdk's firebase-messaging.
    implementation("com.google.firebase:firebase-messaging:23.4.0")`
        );
        fs.writeFileSync(gradlePath, gradle, 'utf8');
      }

      return config;
    },
  ]);
}

module.exports = withTwilioVoice;
