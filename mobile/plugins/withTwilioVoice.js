const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withTwilioVoice(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const mainAppPath = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java',
        ...config.android.package.split('.'),
        'MainApplication.kt'
      );

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

      fs.writeFileSync(mainAppPath, contents, 'utf8');

      // Create twilio_config.xml to disable Firebase messaging service
      // (prevents crash when google-services.json is not configured)
      const valuesDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'values'
      );
      const twilioConfigPath = path.join(valuesDir, 'twilio_config.xml');
      if (!fs.existsSync(twilioConfigPath)) {
        fs.mkdirSync(valuesDir, { recursive: true });
        fs.writeFileSync(twilioConfigPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <bool name="twiliovoicereactnative_firebasemessagingservice_enabled">false</bool>
</resources>
`, 'utf8');
      }

      return config;
    },
  ]);
}

module.exports = withTwilioVoice;
