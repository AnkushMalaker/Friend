# Omi Connection Documentation

The `OmiConnection` class is the main interface for communicating with Omi devices via Bluetooth LE in Flutter applications.

## Service UUIDs

The Omi devices use the following UUIDs for BLE services and characteristics:

- Omi Service: `19b10000-e8f2-537e-4f6c-d104768a1214`
- Audio Codec Characteristic: `19b10002-e8f2-537e-4f6c-d104768a1214`
- Audio Data Stream Characteristic: `19b10001-e8f2-537e-4f6c-d104768a1214`

## Basic Usage Flow

A typical usage flow with the Omi Flutter SDK involves:

1. Creating an instance of `OmiConnection`
2. Scanning for devices
3. Connecting to a device
4. Reading device characteristics (codec, battery level)
5. Subscribing to audio data
6. Processing audio data
7. Disconnecting from the device

## API Reference

### Constructor

```dart
OmiConnection()
```

Creates a new instance of the OmiConnection class.

### Properties

- `connectedDeviceId` - The ID of the currently connected device
- `isConnecting` - Whether the instance is currently connecting to a device
- `isConnected` - Whether the instance is currently connected to a device

### Methods

#### Scan for Devices

```dart
Function scanForDevices({
  required void Function(OmiDevice device) onDeviceFound,
  int timeoutMs = 10000,
})
```

Scans for Omi devices and calls the `onDeviceFound` callback when a device is found.

Returns a function that stops scanning when called.

#### Connect to a Device

```dart
Future<bool> connect(
  String deviceId, {
  void Function(String deviceId, DeviceConnectionState state)? onConnectionStateChanged,
})
```

Connects to an Omi device with the specified ID.

Returns a Future that resolves to `true` if the connection was successful, `false` otherwise.

#### Disconnect from a Device

```dart
Future<void> disconnect()
```

Disconnects from the currently connected device.

#### Get Audio Codec

```dart
Future<BleAudioCodec> getAudioCodec()
```

Gets the audio codec used by the currently connected device.

Returns a Future that resolves to the audio codec enum value.

#### Start Audio Bytes Listener

```dart
Future<StreamSubscription?> startAudioBytesListener(
  void Function(List<int> bytes) onAudioBytesReceived,
)
```

Starts listening for audio data from the connected device.

The `onAudioBytesReceived` callback is called when audio data is received.

Returns a Future that resolves to a StreamSubscription which can be used to cancel the listener.

#### Stop Audio Bytes Listener

```dart
Future<void> stopAudioBytesListener(StreamSubscription subscription)
```

Stops listening for audio data.

#### Get Battery Level

```dart
Future<int> getBatteryLevel()
```

Gets the battery level of the connected device.

Returns a Future that resolves to the battery level as a percentage (0-100).

## Error Handling

Most methods in the `OmiConnection` class will throw exceptions if the device is not connected. Always check the connection state before calling methods that require a connection.

It's good practice to wrap method calls in try-catch blocks:

```dart
try {
  final codec = await omiConnection.getAudioCodec();
  // Process codec
} catch (e) {
  print('Error getting codec: $e');
}
``` 