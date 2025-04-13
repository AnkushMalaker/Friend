/// Omi SDK for Flutter
/// Dart implementation for interacting with Omi devices
library omi_flutter;

// Export classes and types
export 'src/omi_connection.dart';
export 'src/types.dart';
export 'src/codecs.dart';

/// Version of the Omi Flutter SDK
const String version = '1.0.0';

/// Echo function that returns a greeting with the provided word
String echo(String word) {
  print('Omi SDK: Echo function called');
  return 'Hello from Omi SDK! You said: $word';
} 