# Kraydl Dialer - Icon & Local Build Instructions

## ✅ What's Been Fixed

### 1. Navigation & UI Consistency
- **Tab Bar Hidden on Dialer Screen**: The bottom tab navigation is now hidden on the Dialer screen to prevent it from overlapping with the dial pad
- **Consistent Background Colors**: All screens now use the unified color scheme:
  - Main background: `#1a1a2e` (dark blue-grey)
  - Cards/Inputs: `#2a2a3e` (slightly lighter)
  - Borders: `#2a2a3e`
  - Active elements: `#4CAF50` (green)
- **Logout Button Moved**: Logout button moved to Contacts screen header to avoid cluttering Dialer
- **All Screens Updated**: LoginScreen, DialerScreen, ActiveCallScreen, IncomingCallScreen, CallHistoryScreen, ContactsScreen, ContactDetailScreen, AdminScreen

### 2. App Configuration
- **App Name**: Changed to "Kraydl Dialer" 
- **Package Name**: Updated to `com.kraydl.dialer`
- **Dark Mode**: Set as default UI style
- **Splash Screen**: Background updated to match app theme

## 📱 App Icon Instructions

You provided the Kraydl logo (blue "A" shape). To use it as your app icon:

### Option 1: Quick Setup (Recommended)
1. Save your Kraydl logo as `icon.png` in the `mobile/assets/` folder
   - Required size: **1024x1024 pixels**
   - Format: PNG with transparency
   - The icon should be the blue "A" shape you provided

### Option 2: Manual Asset Creation
If you want proper adaptive icons for Android:

1. **Create these files in `mobile/assets/`:**
   - `icon.png` (1024x1024) - Your Kraydl logo
   - `splash-icon.png` (1024x1024) - Same logo for splash screen
   - `favicon.png` (48x48) - Small version for web

2. **Run the prebuild** to generate Android/iOS native resources:
   ```bash
   cd d:\project\kraydl\dialer\mobile
   npm run prebuild
   ```

## 🔨 Local Build Instructions

### Prerequisites
- Android Studio installed with Android SDK
- Java Development Kit (JDK) 17 or later
- Your Android device connected via USB with USB debugging enabled, OR Android emulator running

### Build Steps

#### 1. Clean Prebuild (First Time or After Changes)
```bash
cd d:\project\kraydl\dialer\mobile
npm run prebuild
```

This generates the `android/` folder with all native configurations.

#### 2. Build & Install Development APK
```bash
npm run android:dev
```

This will:
- Build the app in debug mode
- Install it on your connected device/emulator
- Start the Metro bundler

#### 3. Build Release APK (For Distribution)
```bash
npm run android:build
```

This creates a release APK at:
`android/app/build/outputs/apk/release/app-release.apk`

### Alternative: Manual Build Commands

If the npm scripts don't work, use these commands:

```bash
# 1. Clean prebuild
npx expo prebuild --clean

# 2. Build and install debug
npx expo run:android --variant debug

# 3. Or build release APK
cd android
.\gradlew assembleRelease
```

The release APK will be at:
`android\app\build\outputs\apk\release\app-release.apk`

### Troubleshooting

#### Error: "SDK location not found"
Create `android/local.properties` with:
```
sdk.dir=C:\\Users\\YourUsername\\AppData\\Local\\Android\\Sdk
```
(Replace with your actual Android SDK path)

#### Error: "Execution failed for task ':app:packageRelease'"
You need to create a signing keystore:
```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore kraydl-release.keystore -alias kraydl -keyalg RSA -keysize 2048 -validity 10000
```

Then update `android/app/build.gradle` signing config.

#### Error: "No connected devices"
- Make sure USB debugging is enabled on your phone
- Run `adb devices` to check if device is detected
- Or start an Android emulator from Android Studio

## 🎨 Current App Theme

- **Primary Color**: Green (`#4CAF50`) - for call buttons, active states
- **Danger Color**: Red (`#f44336`) - for hangup, delete actions
- **Background**: Dark grey-blue (`#1a1a2e`)
- **Cards/Surfaces**: Lighter grey-blue (`#2a2a3e`)
- **Text Primary**: White
- **Text Secondary**: Grey (`#888`)

## 📋 Build Checklist

- [x] Navigation fixed (tab bar hidden on Dialer)
- [x] Consistent colors across all screens
- [x] App name and package updated
- [ ] Replace icon.png with Kraydl logo (1024x1024)
- [ ] Run `npm run prebuild` to generate native assets
- [ ] Run `npm run android:dev` to build and test
- [ ] Run `npm run android:build` for release APK

## 🚀 Next Steps

1. **Replace the icon**: Save your Kraydl logo as `icon.png` in `mobile/assets/`
2. **Prebuild**: Run `npm run prebuild` to generate native resources
3. **Build**: Run `npm run android:dev` to build and install on your device
4. **Test**: Make a call to verify everything works
5. **Release**: Run `npm run android:build` to create the release APK

Your app is now ready with a professional, consistent design and proper local build setup!
