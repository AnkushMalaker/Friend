/// Types for the Omi Flutter SDK

/// Audio codec enum for Bluetooth communication
enum BleAudioCodec {
  pcm16,
  pcm8,
  opus,
  unknown,
}

/// Device connection state enum
enum DeviceConnectionState {
  connected,
  disconnected,
  connecting,
  disconnecting,
}

/// Extension to get string values from BleAudioCodec
extension BleAudioCodecExtension on BleAudioCodec {
  String get value {
    switch (this) {
      case BleAudioCodec.pcm16:
        return 'pcm16';
      case BleAudioCodec.pcm8:
        return 'pcm8';
      case BleAudioCodec.opus:
        return 'opus';
      case BleAudioCodec.unknown:
      default:
        return 'unknown';
    }
  }

  static BleAudioCodec fromInt(int value) {
    switch (value) {
      case 0:
        return BleAudioCodec.pcm16;
      case 1:
        return BleAudioCodec.pcm8;
      case 2:
        return BleAudioCodec.opus;
      default:
        return BleAudioCodec.unknown;
    }
  }
}

/// Omi device info
class OmiDevice {
  final String id;
  final String name;
  final int rssi;

  OmiDevice({
    required this.id,
    required this.name,
    required this.rssi,
  });
}

/// Options for audio processing
class AudioProcessingOptions {
  final int? sampleRate;
  final int? channels;
  final int? bitDepth;
  final BleAudioCodec? codec;

  AudioProcessingOptions({
    this.sampleRate,
    this.channels,
    this.bitDepth,
    this.codec,
  });
}

/// Audio data event
class AudioDataEvent {
  final String deviceId;
  final List<int> data;
  final int timestamp;

  AudioDataEvent({
    required this.deviceId,
    required this.data,
    required this.timestamp,
  });
}

/// Connection state change event
class ConnectionStateEvent {
  final String deviceId;
  final DeviceConnectionState state;

  ConnectionStateEvent({
    required this.deviceId,
    required this.state,
  });
} 