# Android LAN test build

This test build uses HTTP on the local network and a test-only Android package ID. It is intended for a trusted Wi-Fi network, not distribution as a production release. Keep the backend and, for links to the web portal, the Expo web server running on the PC while testing.

The current PC address is `192.168.8.15`. First check `http://192.168.8.15:5000/health` in the phone's browser. If the address changes, rebuild the APK with the new address below. The backend uses port 5000 and the portal uses port 8081.

The successful build on this PC used the temporary snapshot at `C:\a\f` and the Gradle cache at `C:\a\g` to work around Windows path-length limits. The snapshot does not automatically receive later source changes. The temporary Android configuration also sets `CMAKE_OBJECT_PATH_MAX=240` for the app and gesture-handler module. A fresh snapshot needs those build-only adjustments again.

To rebuild that same snapshot after changing the PC address, run from PowerShell:

```powershell
$env:EXPO_LAN_TEST = '1'
$env:EXPO_PUBLIC_LAN_HOST = '192.168.8.15'
$env:JAVA_HOME = 'C:\Program Files\Android\openjdk\jdk-21.0.8'
$env:ANDROID_HOME = 'C:\Users\Mistire\AppData\Local\Android\Sdk'
$env:GRADLE_USER_HOME = 'C:\a\g'
Push-Location 'C:\a\f\android'
# Force the JavaScript bundle to be regenerated for the new address.
Remove-Item -LiteralPath 'app\build\generated\assets\react\release\index.android.bundle' -ErrorAction SilentlyContinue
.\gradlew.bat assembleRelease --max-workers=4
Pop-Location
```

The APK is generated at `C:\a\f\android\app\build\outputs\apk\release\app-release.apk`; verify the embedded address before distributing a rebuilt file. The generated local release configuration uses the Android debug signing key; it is suitable only for testing. `EXPO_PUBLIC_LAN_HOST` is embedded at build time, not changed after installation. The explicit `EXPO_LAN_TEST` flag enables Android cleartext traffic only in this test configuration.

The app currently has an in-app notifications inbox, but Android push notifications and scheduled device reminders have not been implemented or configured. A Firebase/FCM and Expo project setup, application and backend implementation, and an actual device delivery test are needed before claiming push works.
