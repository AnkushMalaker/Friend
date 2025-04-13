# Omi Flutter SDK

Flutter SDK for interacting with Omi devices via Bluetooth LE.

## Features

- Scan for nearby Omi devices
- Connect to Omi devices
- Get device information (battery level, audio codec)
- Receive audio data from Omi devices

## Installation

Add this package to your pubspec.yaml:

```yaml
dependencies:
  omi_flutter: ^1.0.0
```

### Android Setup

Add the following permissions to your AndroidManifest.xml:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

### iOS Setup

Add the following to your Info.plist:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Need BLE permission to connect to Omi devices</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Need BLE permission to connect to Omi devices</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Need location permission to scan for nearby BLE devices</string>
```

## Usage

### Basic Example

```dart
import 'package:omi_flutter/omi_flutter.dart';

// Create an instance of OmiConnection
final omiConnection = OmiConnection();

// Scan for devices
final stopScan = omiConnection.scanForDevices(
  onDeviceFound: (device) {
    print('Found device: ${device.name} (${device.id})');
  },
  timeoutMs: 10000, // 10 seconds
);

// Connect to a device
await omiConnection.connect(
  deviceId,
  onConnectionStateChanged: (deviceId, state) {
    print('Device $deviceId state changed to: $state');
  },
);

// Get the audio codec
final codec = await omiConnection.getAudioCodec();
print('Device codec: ${mapCodecToName(codec)}');

// Listen for audio data
final subscription = await omiConnection.startAudioBytesListener(
  (bytes) {
    // Process audio bytes
    print('Received ${bytes.length} bytes of audio data');
  },
);

// Get battery level
final batteryLevel = await omiConnection.getBatteryLevel();
print('Battery level: $batteryLevel%');

// Later, stop listening and disconnect
await omiConnection.stopAudioBytesListener(subscription);
await omiConnection.disconnect();
```

## Available Methods

- `scanForDevices()` - Scan for nearby Omi devices
- `connect()` - Connect to an Omi device
- `disconnect()` - Disconnect from the currently connected device
- `isConnected` - Check if connected to a device
- `getAudioCodec()` - Get the audio codec used by the device
- `startAudioBytesListener()` - Start listening for audio data
- `stopAudioBytesListener()` - Stop listening for audio data
- `getBatteryLevel()` - Get the battery level of the connected device

## License

MIT 