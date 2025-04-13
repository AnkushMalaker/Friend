import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

import 'types.dart';

/// Service and characteristic UUIDs
const String omiServiceUuid = '19b10000-e8f2-537e-4f6c-d104768a1214';
const String audioCodecCharacteristicUuid = '19b10002-e8f2-537e-4f6c-d104768a1214';
const String audioDataStreamCharacteristicUuid = '19b10001-e8f2-537e-4f6c-d104768a1214';

/// Battery service UUIDs
const String batteryServiceUuid = '0000180f-0000-1000-8000-00805f9b34fb';
const String batteryLevelCharacteristicUuid = '00002a19-0000-1000-8000-00805f9b34fb';

/// Main class for connecting to and interacting with Omi devices
class OmiConnection {
  /// The BLE instance
  final FlutterBluePlus _flutterBlue = FlutterBluePlus.instance;
  
  /// Currently connected device
  BluetoothDevice? _device;
  
  /// Flag to track connection in progress
  bool _isConnecting = false;
  
  /// Internal ID of the connected device
  String? _connectedDeviceId;
  
  /// Audio data stream subscription
  StreamSubscription? _audioStreamSubscription;

  /// Get the connected device ID
  String? get connectedDeviceId => _connectedDeviceId;

  /// Whether the instance is currently connecting to a device
  bool get isConnecting => _isConnecting;

  /// Whether the instance is currently connected to a device
  bool get isConnected => _device != null;

  /// Constructor
  OmiConnection();

  /// Scan for Omi devices
  /// 
  /// [onDeviceFound] - Callback when a device is found
  /// [timeoutMs] - Scan timeout in milliseconds
  /// Returns a function to stop scanning
  Function scanForDevices({
    required void Function(OmiDevice device) onDeviceFound,
    int timeoutMs = 10000,
  }) {
    // Start scanning
    _flutterBlue.startScan(timeout: Duration(milliseconds: timeoutMs));

    // Listen for scan results
    StreamSubscription subscription = _flutterBlue.scanResults.listen((results) {
      for (ScanResult result in results) {
        if (result.device.name.isNotEmpty) {
          onDeviceFound(OmiDevice(
            id: result.device.id.id,
            name: result.device.name,
            rssi: result.rssi,
          ));
        }
      }
    });

    // Return function to stop scanning
    return () {
      _flutterBlue.stopScan();
      subscription.cancel();
    };
  }

  /// Connect to an Omi device
  ///
  /// [deviceId] - The device ID to connect to
  /// [onConnectionStateChanged] - Callback for connection state changes
  /// Returns a future that resolves when connected
  Future<bool> connect(
    String deviceId, {
    void Function(String deviceId, DeviceConnectionState state)? onConnectionStateChanged,
  }) async {
    if (_isConnecting) {
      return false;
    }

    _isConnecting = true;

    try {
      // Find the device
      List<BluetoothDevice> devices = await _flutterBlue.connectedDevices;
      BluetoothDevice? device = devices.firstWhere(
        (d) => d.id.id == deviceId,
        orElse: () => null,
      );

      // If not found in connected devices, look in scan results
      if (device == null) {
        await _flutterBlue.startScan(timeout: const Duration(seconds: 4));
        List<ScanResult> scanResults = await _flutterBlue.scanResults.first;
        
        ScanResult? scanResult = scanResults.firstWhere(
          (r) => r.device.id.id == deviceId,
          orElse: () => null,
        );
        
        if (scanResult != null) {
          device = scanResult.device;
        }
      }

      if (device == null) {
        _isConnecting = false;
        return false;
      }

      // Connect to the device
      await device.connect();
      _device = device;
      _connectedDeviceId = deviceId;

      // Discover services
      await device.discoverServices();

      // Set up connection state listener
      device.state.listen((state) {
        if (state == BluetoothDeviceState.disconnected) {
          _device = null;
          _connectedDeviceId = null;
          
          if (onConnectionStateChanged != null) {
            onConnectionStateChanged(
              deviceId, 
              DeviceConnectionState.disconnected,
            );
          }
        }
      });

      if (onConnectionStateChanged != null) {
        onConnectionStateChanged(
          deviceId, 
          DeviceConnectionState.connected,
        );
      }

      _isConnecting = false;
      return true;
    } catch (e) {
      if (kDebugMode) {
        print('Connection error: $e');
      }
      _isConnecting = false;
      return false;
    }
  }

  /// Disconnect from the currently connected device
  Future<void> disconnect() async {
    if (_device != null) {
      await _device!.disconnect();
      _device = null;
      _connectedDeviceId = null;
    }
  }

  /// Get the audio codec used by the device
  Future<BleAudioCodec> getAudioCodec() async {
    if (_device == null) {
      throw Exception('Device not connected');
    }

    try {
      // Get the Omi service
      List<BluetoothService> services = await _device!.discoverServices();
      BluetoothService? omiService = services.firstWhere(
        (service) => service.uuid.toString().toLowerCase() == omiServiceUuid.toLowerCase(),
        orElse: () => null,
      );

      if (omiService == null) {
        if (kDebugMode) {
          print('Omi service not found');
        }
        return BleAudioCodec.pcm8; // Default codec
      }

      // Get the audio codec characteristic
      BluetoothCharacteristic? codecCharacteristic = omiService.characteristics.firstWhere(
        (char) => char.uuid.toString().toLowerCase() == audioCodecCharacteristicUuid.toLowerCase(),
        orElse: () => null,
      );

      if (codecCharacteristic == null) {
        if (kDebugMode) {
          print('Audio codec characteristic not found');
        }
        return BleAudioCodec.pcm8; // Default codec
      }

      // Read the codec value
      List<int> value = await codecCharacteristic.read();
      
      // Default codec is PCM8
      int codecId = 1;
      
      if (value.isNotEmpty) {
        codecId = value[0];
      }

      return BleAudioCodecExtension.fromInt(codecId);
    } catch (e) {
      if (kDebugMode) {
        print('Error getting codec: $e');
      }
      return BleAudioCodec.pcm8; // Default codec on error
    }
  }

  /// Start listening for audio data
  ///
  /// [onAudioBytesReceived] - Callback for audio data
  /// Returns a StreamSubscription that can be used to cancel the listener
  Future<StreamSubscription?> startAudioBytesListener(
    void Function(List<int> bytes) onAudioBytesReceived,
  ) async {
    if (_device == null) {
      throw Exception('Device not connected');
    }

    try {
      // Get the Omi service
      List<BluetoothService> services = await _device!.discoverServices();
      BluetoothService? omiService = services.firstWhere(
        (service) => service.uuid.toString().toLowerCase() == omiServiceUuid.toLowerCase(),
        orElse: () => null,
      );

      if (omiService == null) {
        if (kDebugMode) {
          print('Omi service not found');
        }
        return null;
      }

      // Get the audio data stream characteristic
      BluetoothCharacteristic? audioDataCharacteristic = omiService.characteristics.firstWhere(
        (char) => char.uuid.toString().toLowerCase() == audioDataStreamCharacteristicUuid.toLowerCase(),
        orElse: () => null,
      );

      if (audioDataCharacteristic == null) {
        if (kDebugMode) {
          print('Audio data characteristic not found');
        }
        return null;
      }

      // Enable notifications
      await audioDataCharacteristic.setNotifyValue(true);

      // Listen for notifications
      _audioStreamSubscription = audioDataCharacteristic.value.listen((value) {
        if (value.isNotEmpty) {
          onAudioBytesReceived(value);
        }
      });

      return _audioStreamSubscription;
    } catch (e) {
      if (kDebugMode) {
        print('Error starting audio listener: $e');
      }
      return null;
    }
  }

  /// Stop listening for audio data
  ///
  /// [subscription] - The subscription to cancel
  Future<void> stopAudioBytesListener(StreamSubscription subscription) async {
    await subscription.cancel();
  }

  /// Get the battery level of the connected device
  ///
  /// Returns the battery level as a percentage (0-100)
  Future<int> getBatteryLevel() async {
    if (_device == null) {
      throw Exception('Device not connected');
    }

    try {
      // Get the battery service
      List<BluetoothService> services = await _device!.discoverServices();
      BluetoothService? batteryService = services.firstWhere(
        (service) => service.uuid.toString().toLowerCase() == batteryServiceUuid.toLowerCase(),
        orElse: () => null,
      );

      if (batteryService == null) {
        if (kDebugMode) {
          print('Battery service not found');
        }
        return 0;
      }

      // Get the battery level characteristic
      BluetoothCharacteristic? batteryLevelCharacteristic = batteryService.characteristics.firstWhere(
        (char) => char.uuid.toString().toLowerCase() == batteryLevelCharacteristicUuid.toLowerCase(),
        orElse: () => null,
      );

      if (batteryLevelCharacteristic == null) {
        if (kDebugMode) {
          print('Battery level characteristic not found');
        }
        return 0;
      }

      // Read the battery level
      List<int> value = await batteryLevelCharacteristic.read();
      
      if (value.isNotEmpty) {
        return value[0];
      }

      return 0;
    } catch (e) {
      if (kDebugMode) {
        print('Error getting battery level: $e');
      }
      return 0;
    }
  }
} 