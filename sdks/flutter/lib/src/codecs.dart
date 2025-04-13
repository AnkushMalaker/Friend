import 'types.dart';

/// Maps codec enum to human-readable name
String mapCodecToName(BleAudioCodec codec) {
  switch (codec) {
    case BleAudioCodec.pcm16:
      return 'PCM-16';
    case BleAudioCodec.pcm8:
      return 'PCM-8';
    case BleAudioCodec.opus:
      return 'OPUS';
    case BleAudioCodec.unknown:
    default:
      return 'Unknown';
  }
} 