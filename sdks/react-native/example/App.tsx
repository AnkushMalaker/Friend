import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ScrollView, Alert, Platform, Linking, TextInput } from 'react-native';
import { OmiConnection, BleAudioCodec, OmiDevice } from '@omiai/omi-react-native';
import { BleManager, State, Subscription } from 'react-native-ble-plx';

export default function App() {
  const [devices, setDevices] = useState<OmiDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [codec, setCodec] = useState<BleAudioCodec | null>(null);
  const [bluetoothState, setBluetoothState] = useState<State>(State.Unknown);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [isListeningAudio, setIsListeningAudio] = useState<boolean>(false);
  const [audioPacketsReceived, setAudioPacketsReceived] = useState<number>(0);
  const [batteryLevel, setBatteryLevel] = useState<number>(-1);
  const [enableTranscription, setEnableTranscription] = useState<boolean>(false);
  const [deepgramApiKey, setDeepgramApiKey] = useState<string>('');
  const [transcription, setTranscription] = useState<string>('');
  
  // Backend WebSocket state
  const [backendWsConnected, setBackendWsConnected] = useState<boolean>(false);
  const backendWsRef = useRef<WebSocket | null>(null);
  const [backendWsUrl, setBackendWsUrl] = useState<string>('wss://4be9-106-51-128-138.ngrok-free.app/ws');
  const [backendSessionId, setBackendSessionId] = useState<string>('');
  const [backendTranscription, setBackendTranscription] = useState<string>('');
  const [packetStats, setPacketStats] = useState<{
    sent: number;
    confirmed: number;
    decoded: number;
    failed: number;
    lastSequence: number;
  }>({
    sent: 0,
    confirmed: 0,
    decoded: 0,
    failed: 0,
    lastSequence: 0
  });
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false);
  // Use a simpler tracking approach with fewer entries
  const packetTracking = useRef<{
    sentCount: number;
    confirmedCount: number;
    decodedCount: number;
    failedCount: number;
    lastSequence: number;
    // Only track the last 20 packets for memory efficiency
    lastPackets: Array<{id: number, sent: number, size: number, confirmed?: boolean}>;
  }>({
    sentCount: 0,
    confirmedCount: 0,
    decodedCount: 0,
    failedCount: 0,
    lastSequence: 0,
    lastPackets: []
  });
  const packetStartTime = useRef<number>(0);
  // Track when to update the UI to avoid constant re-renders
  const statsUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Transcription processing state
  const websocketRef = useRef<WebSocket | null>(null);
  const isTranscribing = useRef<boolean>(false);
  const audioBufferRef = useRef<Uint8Array[]>([]);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const omiConnection = useRef(new OmiConnection()).current;
  const stopScanRef = useRef<(() => void) | null>(null);
  const bleManagerRef = useRef<BleManager | null>(null);
  const audioSubscriptionRef = useRef<Subscription | null>(null);

  useEffect(() => {
    // Initialize BLE Manager
    const manager = new BleManager();
    bleManagerRef.current = manager;

    // Subscribe to state changes
    const subscription = manager.onStateChange((state) => {
      console.log('Bluetooth state:', state);
      setBluetoothState(state);

      if (state === State.PoweredOn) {
        // Bluetooth is on, now we can request permission
        requestBluetoothPermission();
      }
    }, true); // true to check the initial state

    return () => {
      // Clean up subscription and manager when component unmounts
      subscription.remove();
      if (bleManagerRef.current) {
        bleManagerRef.current.destroy();
      }
    };
  }, []);

  const requestBluetoothPermission = async () => {
    try {
      console.log('Requesting Bluetooth permissions...');
      
      if (Platform.OS === 'ios') {
        // On iOS, we need to attempt a scan which will trigger the permission dialog
        bleManagerRef.current?.startDeviceScan(null, null, (error) => {
          if (error) {
            console.error('Permission error:', error);
            setPermissionGranted(false);
            Alert.alert(
              'Bluetooth Permission Denied',
              'Please enable Bluetooth permission in your device settings to use this feature.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() }
              ]
            );
          } else {
            setPermissionGranted(true);
            Alert.alert('Bluetooth Permission', 'Bluetooth permission granted successfully!');
          }
          // Stop scanning immediately after permission check
          bleManagerRef.current?.stopDeviceScan();
        });
      } else if (Platform.OS === 'android') {
        // On Android, we need to check for location and bluetooth permissions
        try {
          // This will trigger the permission dialog
          await bleManagerRef.current?.startDeviceScan(null, null, (error) => {
            if (error) {
              console.error('Permission error:', error);
              setPermissionGranted(false);
              Alert.alert(
                'Bluetooth Permission Denied',
                'Please enable Bluetooth and Location permissions in your device settings to use this feature.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() }
                ]
              );
            } else {
              setPermissionGranted(true);
              Alert.alert('Bluetooth Permission', 'Bluetooth permissions granted successfully!');
            }
            // Stop scanning immediately after permission check
            bleManagerRef.current?.stopDeviceScan();
          });
        } catch (error) {
          console.error('Error requesting permissions:', error);
          setPermissionGranted(false);
          Alert.alert('Permission Error', `Failed to request permissions: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error in requestBluetoothPermission:', error);
      setPermissionGranted(false);
      Alert.alert('Error', `An unexpected error occurred: ${error}`);
    }
  };


  const startScan = () => {
    // Check if Bluetooth is on and permission is granted
    if (bluetoothState !== State.PoweredOn) {
      Alert.alert(
        'Bluetooth is Off',
        'Please turn on Bluetooth to scan for devices.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    if (!permissionGranted) {
      requestBluetoothPermission();
      return;
    }

    // Don't clear devices list, just start scanning
    setScanning(true);

    stopScanRef.current = omiConnection.scanForDevices(
      (device) => {
        setDevices((prev) => {
          // Check if device already exists
          if (prev.some((d) => d.id === device.id)) {
            return prev;
          }
          return [...prev, device];
        });
      },
      30000 // 30 seconds timeout
    );

    // Auto-stop after 30 seconds
    setTimeout(() => {
      stopScan();
    }, 30000);
  };

  const stopScan = () => {
    if (stopScanRef.current) {
      stopScanRef.current();
      stopScanRef.current = null;
    }
    setScanning(false);
  };

  const connectToDevice = async (deviceId: string) => {
    try {
      // First check if we're already connected to a device
      if (connected) {
        // Disconnect from the current device first
        await disconnectFromDevice();
      }

      // Set connecting state
      setConnected(false);

      const success = await omiConnection.connect(deviceId, (id, state) => {
        console.log(`Device ${id} connection state: ${state}`);
        const isConnected = state === 'connected';
        setConnected(isConnected);

        if (!isConnected) {
          setCodec(null);
        }
      });

      // Auto-stop scanning when connected successfully
      if (success && scanning) {
        stopScan();
      }

      if (success) {
        setConnected(true);
      } else {
        setConnected(false);
        Alert.alert('Connection Failed', 'Could not connect to device');
      }
    } catch (error) {
      console.error('Connection error:', error);
      setConnected(false);
      Alert.alert('Connection Error', String(error));
    }
  };

  const disconnectFromDevice = async () => {
    try {
      // Stop audio listener if active
      if (isListeningAudio) {
        await stopAudioListener();
      }


      await omiConnection.disconnect();
      setConnected(false);
      setCodec(null);
      setBatteryLevel(-1);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  /**
   * Connect to the backend WebSocket server
   */
  const connectToBackendWs = () => {
    if (backendWsRef.current && backendWsRef.current.readyState === WebSocket.OPEN) {
      console.log('Already connected to backend WebSocket');
      return;
    }

    try {
      console.log(`Connecting to backend WebSocket at ${backendWsUrl}`);
      const ws = new WebSocket(backendWsUrl);

      ws.onopen = () => {
        console.log('Backend WebSocket connection established');
        setBackendWsConnected(true);
        
        // Reset packet tracking on new connection
        setPacketStats({
          sent: 0,
          confirmed: 0, 
          decoded: 0,
          failed: 0,
          lastSequence: 0
        });
        packetTracking.current = {
          sentCount: 0,
          confirmedCount: 0,
          decodedCount: 0,
          failedCount: 0,
          lastSequence: 0,
          lastPackets: []
        };
        packetStartTime.current = Date.now();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.event === 'session_start') {
            setBackendSessionId(message.session_id);
            packetStartTime.current = Date.now();
          }
          else if (message.event === 'packet_received') {
            // Update our internal tracking structure
            const tracking = packetTracking.current;
            tracking.confirmedCount++;
            tracking.lastSequence = message.packet_number;
            
            if (message.decoded) {
              tracking.decodedCount++;
            } else {
              tracking.failedCount++;
            }
            
            // Mark packet as confirmed in our tracking
            const packetIndex = tracking.lastPackets.findIndex(p => p.id === message.packet_number);
            if (packetIndex >= 0) {
              tracking.lastPackets[packetIndex].confirmed = true;
            }
            
            // Only update UI state periodically to avoid excessive re-renders
            if (!statsUpdateTimeoutRef.current) {
              statsUpdateTimeoutRef.current = setTimeout(() => {
                setPacketStats({
                  sent: tracking.sentCount,
                  confirmed: tracking.confirmedCount,
                  decoded: tracking.decodedCount,
                  failed: tracking.failedCount,
                  lastSequence: tracking.lastSequence
                });
                statsUpdateTimeoutRef.current = null;
              }, 500); // Update UI every 500ms
            }
          }
          else if (message.event === 'transcription' && message.text) {
            // Handle transcription from backend
            const newTranscript = message.text.trim();
            if (newTranscript) {
              setBackendTranscription((prev) => {
                const lines = prev ? prev.split('\n') : [];
                if (lines.length > 4) { // Keep last 5 lines
                  lines.shift();
                }
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                lines.push(`[${timestamp}] ${newTranscript}`);
                return lines.join('\n');
              });
            }
          }
        } catch (error) {
          console.error('Error processing backend message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Backend WebSocket error:', error);
        setBackendWsConnected(false);
      };

      ws.onclose = () => {
        console.log('Backend WebSocket connection closed');
        setBackendWsConnected(false);
        
        // Clear any pending updates
        if (statsUpdateTimeoutRef.current) {
          clearTimeout(statsUpdateTimeoutRef.current);
          statsUpdateTimeoutRef.current = null;
        }
      };

      backendWsRef.current = ws;
    } catch (error) {
      console.error('Error connecting to backend WebSocket:', error);
      setBackendWsConnected(false);
    }
  };

  /**
   * Disconnect from the backend WebSocket server
   */
  const disconnectFromBackendWs = () => {
    if (backendWsRef.current) {
      backendWsRef.current.close();
      backendWsRef.current = null;
      setBackendWsConnected(false);
      
      // Clear any pending updates
      if (statsUpdateTimeoutRef.current) {
        clearTimeout(statsUpdateTimeoutRef.current);
        statsUpdateTimeoutRef.current = null;
      }
    }
  };

  // Modified startAudioListener to also send to our backend
  const startAudioListener = async () => {
    try {
      if (!connected || !omiConnection.isConnected()) {
        Alert.alert('Not Connected', 'Please connect to a device first');
        return;
      }

      // Reset counter
      setAudioPacketsReceived(0);
      packetStartTime.current = Date.now();

      console.log('Starting audio bytes listener...');

      // Use a counter and timer to batch UI updates
      let packetCounter = 0;
      const updateInterval = setInterval(() => {
        if (packetCounter > 0) {
          setAudioPacketsReceived(prev => prev + packetCounter);
          packetCounter = 0;
        }
      }, 500); // Update UI every 500ms

      const subscription = await omiConnection.startAudioBytesListener((bytes) => {
        // Increment local counter instead of updating state directly
        packetCounter++;

        // If transcription is enabled and active, add to buffer for WebSocket
        if (bytes.length > 0 && isTranscribing.current) {
          audioBufferRef.current.push(new Uint8Array(bytes));
        }

        // Send to our backend WebSocket if connected
        if (bytes.length > 0 && backendWsConnected && backendWsRef.current && 
            backendWsRef.current.readyState === WebSocket.OPEN) {
            
          const tracking = packetTracking.current;
          // Increment the packet count
          tracking.sentCount++;
          
          // Add to our tracking buffer (limited size)
          const packetNumber = tracking.sentCount;
          
          // Keep only the last 20 packets to avoid memory issues
          if (tracking.lastPackets.length >= 20) {
            tracking.lastPackets.shift(); // Remove oldest packet
          }
          
          // Add new packet to tracking
          tracking.lastPackets.push({
            id: packetNumber,
            sent: Date.now(),
            size: bytes.length
          });
          
          // Only update UI state periodically
          if (!statsUpdateTimeoutRef.current) {
            statsUpdateTimeoutRef.current = setTimeout(() => {
              setPacketStats({
                sent: tracking.sentCount,
                confirmed: tracking.confirmedCount,
                decoded: tracking.decodedCount,
                failed: tracking.failedCount,
                lastSequence: tracking.lastSequence
              });
              statsUpdateTimeoutRef.current = null;
            }, 500);
          }
          
          // Send the packet
          backendWsRef.current.send(new Uint8Array(bytes));
        }
      });

      // Store interval reference for cleanup
      updateIntervalRef.current = updateInterval;

      if (subscription) {
        audioSubscriptionRef.current = subscription;
        updateIntervalRef.current = updateInterval;
        setIsListeningAudio(true);

        // If transcription was active, stop it when audio listener stops
        if (isTranscribing.current) {
          if (websocketRef.current) {
            websocketRef.current.close();
            websocketRef.current = null;
          }

          if (processingIntervalRef.current) {
            clearInterval(processingIntervalRef.current);
            processingIntervalRef.current = null;
          }

          isTranscribing.current = false;
        }
      } else {
        Alert.alert('Error', 'Failed to start audio listener');
      }
    } catch (error) {
      console.error('Start audio listener error:', error);
      Alert.alert('Error', `Failed to start audio listener: ${error}`);
    }
  };

  /**
   * Initialize WebSocket transcription service with Deepgram
   */
  const initializeWebSocketTranscription = () => {
    if (!deepgramApiKey) {
      console.error('API key is required for transcription');
      return;
    }

    try {
      // Close any existing connection
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }

      // Clear any existing processing interval
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }

      // Reset audio buffer
      audioBufferRef.current = [];
      isTranscribing.current = false;

      // Create a new WebSocket connection to Deepgram with configuration in URL params
      const params = new URLSearchParams({
        sample_rate: '16000',
        encoding: 'opus',
        channels: '1',
        model: 'nova-2',
        language: 'en-US',
        smart_format: 'true',
        interim_results: 'false',
        punctuate: 'true',
        diarize: 'true'
      });

      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, [], {
        headers: {
          'Authorization': `Token ${deepgramApiKey}`
        }
      });

      ws.onopen = () => {
        console.log('Deepgram WebSocket connection established');
        isTranscribing.current = true;

        // Start processing interval to send accumulated audio
        processingIntervalRef.current = setInterval(() => {
          if (audioBufferRef.current.length > 0 && isTranscribing.current) {
            sendAudioToWebSocket();
          }
        }, 250); // Send audio every 250ms
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Transcript received:", data);

          // Check if we have a transcript
          if (data.channel?.alternatives?.[0]?.transcript) {
            const transcript = data.channel.alternatives[0].transcript.trim();

            // Only update UI if we have actual text
            if (transcript) {
              setTranscription((prev) => {
                // Limit to last 5 transcripts to avoid too much text
                const lines = prev ? prev.split('\n') : [];
                if (lines.length > 4) {
                  lines.shift();
                }

                // Add new transcript with a timestamp
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

                // Add speaker information if available
                const speakerInfo = data.channel.alternatives[0].words?.[0]?.speaker
                  ? `[Speaker ${data.channel.alternatives[0].words[0].speaker}]`
                  : '';

                lines.push(`[${timestamp}] ${speakerInfo} ${transcript}`);

                return lines.join('\n');
              });
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('Deepgram WebSocket connection closed');
        isTranscribing.current = false;
      };

      websocketRef.current = ws;
      console.log('Deepgram WebSocket transcription initialized');

    } catch (error) {
      console.error('Error initializing Deepgram WebSocket transcription:', error);
    }
  };

  /**
   * Send accumulated audio buffer to Deepgram WebSocket
   */
  const sendAudioToWebSocket = () => {
    if (!websocketRef.current || !isTranscribing.current || audioBufferRef.current.length === 0) {
      return;
    }

    try {
      // Send each audio chunk individually to Deepgram
      // This is more efficient for streaming audio
      for (const chunk of audioBufferRef.current) {
        if (websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.send(chunk);
        }
      }

      // Clear the buffer after sending
      audioBufferRef.current = [];
    } catch (error) {
      console.error('Error sending audio to Deepgram WebSocket:', error);
    }
  };


  // Store the update interval reference
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopAudioListener = async () => {
    try {
      // Clear the UI update interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }

      if (audioSubscriptionRef.current) {
        await omiConnection.stopAudioBytesListener(audioSubscriptionRef.current);
        audioSubscriptionRef.current = null;
        setIsListeningAudio(false);

        // Disable transcription
        if (enableTranscription) {
          // Close WebSocket connection
          if (websocketRef.current) {
            websocketRef.current.close();
            websocketRef.current = null;
          }

          // Clear processing interval
          if (processingIntervalRef.current) {
            clearInterval(processingIntervalRef.current);
            processingIntervalRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error('Stop audio listener error:', error);
      Alert.alert('Error', `Failed to stop audio listener: ${error}`);
    }
  };

  const getAudioCodec = async () => {
    try {
      if (!connected || !omiConnection.isConnected()) {
        Alert.alert('Not Connected', 'Please connect to a device first');
        return;
      }

      try {
        const codecValue = await omiConnection.getAudioCodec();
        setCodec(codecValue);
      } catch (error) {
        console.error('Get codec error:', error);

        // If we get a connection error, update the UI state
        if (String(error).includes('not connected')) {
          setConnected(false);
          Alert.alert('Connection Lost', 'The device appears to be disconnected. Please reconnect and try again.');
        } else {
          Alert.alert('Error', `Failed to get audio codec: ${error}`);
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', `An unexpected error occurred: ${error}`);
    }
  };

  const getBatteryLevel = async () => {
    try {
      if (!connected || !omiConnection.isConnected()) {
        Alert.alert('Not Connected', 'Please connect to a device first');
        return;
      }

      try {
        const level = await omiConnection.getBatteryLevel();
        setBatteryLevel(level);
      } catch (error) {
        console.error('Get battery level error:', error);

        // If we get a connection error, update the UI state
        if (String(error).includes('not connected')) {
          setConnected(false);
          Alert.alert('Connection Lost', 'The device appears to be disconnected. Please reconnect and try again.');
        } else {
          Alert.alert('Error', `Failed to get battery level: ${error}`);
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', `An unexpected error occurred: ${error}`);
    }
  };

  // Calculate packet loss rate
  const getPacketLossRate = () => {
    if (packetStats.sent === 0) return '0%';
    const lossRate = ((packetStats.sent - packetStats.confirmed) / packetStats.sent) * 100;
    return `${lossRate.toFixed(2)}%`;
  };

  // Calculate decode success rate
  const getDecodeSuccessRate = () => {
    if (packetStats.confirmed === 0) return '0%';
    const successRate = (packetStats.decoded / packetStats.confirmed) * 100;
    return `${successRate.toFixed(2)}%`;
  };

  // Calculate packets per second
  const getPacketsPerSecond = () => {
    const elapsedTimeSeconds = (Date.now() - packetStartTime.current) / 1000;
    if (elapsedTimeSeconds <= 0) return '0';
    return (packetStats.sent / elapsedTimeSeconds).toFixed(1);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Omi SDK Example</Text>

        {/* Bluetooth Status Banner */}
        {bluetoothState !== State.PoweredOn && (
          <View style={styles.statusBanner}>
            <Text style={styles.statusText}>
              {bluetoothState === State.PoweredOff
                ? 'Bluetooth is turned off. Please enable Bluetooth to use this app.'
                : bluetoothState === State.Unauthorized
                  ? 'Bluetooth permission not granted. Please allow Bluetooth access in settings.'
                  : 'Bluetooth is not available or initializing...'}
            </Text>
            <TouchableOpacity
              style={styles.statusButton}
              onPress={() => {
                if (bluetoothState === State.PoweredOff) {
                  Linking.openSettings();
                } else if (bluetoothState === State.Unauthorized) {
                  requestBluetoothPermission();
                }
              }}
            >
              <Text style={styles.statusButtonText}>
                {bluetoothState === State.PoweredOff ? 'Open Settings' : 'Request Permission'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Backend WebSocket section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backend WebSocket</Text>
          <TextInput
            style={styles.input}
            placeholder="Backend WebSocket URL"
            value={backendWsUrl}
            onChangeText={setBackendWsUrl}
          />
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.button, backendWsConnected ? styles.buttonDanger : styles.button]}
              onPress={backendWsConnected ? disconnectFromBackendWs : connectToBackendWs}
            >
              <Text style={styles.buttonText}>
                {backendWsConnected ? 'Disconnect from Backend' : 'Connect to Backend'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.status}>
            Status: {backendWsConnected ? 'Connected' : 'Disconnected'}
          </Text>
          
          {backendWsConnected && backendSessionId && (
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionText}>Session ID: {backendSessionId}</Text>
              <TouchableOpacity
                style={styles.debugButton}
                onPress={() => setShowDebugInfo(!showDebugInfo)}
              >
                <Text style={styles.debugButtonText}>
                  {showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          
          {backendWsConnected && showDebugInfo && (
            <View style={styles.debugInfo}>
              <Text style={styles.debugTitle}>Packet Tracking</Text>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Packets Sent:</Text>
                <Text style={styles.debugValue}>{packetStats.sent}</Text>
              </View>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Packets Confirmed:</Text>
                <Text style={styles.debugValue}>{packetStats.confirmed}</Text>
              </View>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Successfully Decoded:</Text>
                <Text style={styles.debugValue}>{packetStats.decoded}</Text>
              </View>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Decode Failed:</Text>
                <Text style={styles.debugValue}>{packetStats.failed}</Text>
              </View>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Packet Loss Rate:</Text>
                <Text style={styles.debugValue}>{getPacketLossRate()}</Text>
              </View>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Decode Success Rate:</Text>
                <Text style={styles.debugValue}>{getDecodeSuccessRate()}</Text>
              </View>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Packets Per Second:</Text>
                <Text style={styles.debugValue}>{getPacketsPerSecond()}</Text>
              </View>
              <View style={styles.debugRow}>
                <Text style={styles.debugLabel}>Last Sequence Number:</Text>
                <Text style={styles.debugValue}>{packetStats.lastSequence}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Separate Section for Backend Transcription */}
        {backendWsConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Backend Transcription</Text>
            {backendTranscription ? (
              <View style={styles.transcriptionTextContainer}>
                <Text style={styles.transcriptionText}>{backendTranscription}</Text>
              </View>
            ) : (
              <Text style={styles.status}>Waiting for transcription...</Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bluetooth Connection</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.button, styles.buttonFull, scanning ? styles.buttonWarning : null]}
              onPress={scanning ? stopScan : startScan}
            >
              <Text style={styles.buttonText}>{scanning ? "Stop Scan" : "Scan for Devices"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.button, permissionGranted ? styles.buttonSuccess : styles.buttonPrimary, { marginTop: 10 }]}
            onPress={requestBluetoothPermission}
          >
            <Text style={styles.buttonText}>
              {permissionGranted ? "Permissions Granted" : "Request Bluetooth Permissions"}
            </Text>
          </TouchableOpacity>
        </View>

        {devices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Found Devices</Text>
            <View style={styles.deviceList}>
              {devices.map((device) => (
                <View key={device.id} style={styles.deviceItem}>
                  <View>
                    <Text style={styles.deviceName}>{device.name}</Text>
                    <Text style={styles.deviceInfo}>RSSI: {device.rssi} dBm</Text>
                  </View>
                  {connected && omiConnection.connectedDeviceId === device.id ? (
                    <TouchableOpacity
                      style={[styles.button, styles.smallButton, styles.buttonDanger]}
                      onPress={disconnectFromDevice}
                    >
                      <Text style={styles.buttonText}>Disconnect</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.button, styles.smallButton, connected ? styles.buttonDisabled : null]}
                      onPress={() => connectToDevice(device.id)}
                      disabled={connected}
                    >
                      <Text style={styles.buttonText}>Connect</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {connected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device Functions</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={getAudioCodec}
            >
              <Text style={styles.buttonText}>Get Audio Codec</Text>
            </TouchableOpacity>

            {codec && (
              <View style={styles.codecContainer}>
                <Text style={styles.codecTitle}>Current Audio Codec:</Text>
                <Text style={styles.codecValue}>{codec}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                { marginTop: 15 }
              ]}
              onPress={getBatteryLevel}
            >
              <Text style={styles.buttonText}>Get Battery Level</Text>
            </TouchableOpacity>

            {batteryLevel >= 0 && (
              <View style={styles.batteryContainer}>
                <Text style={styles.batteryTitle}>Battery Level:</Text>
                <View style={styles.batteryLevelContainer}>
                  <View style={[styles.batteryLevelBar, { width: `${batteryLevel}%` }]} />
                  <Text style={styles.batteryLevelText}>{batteryLevel}%</Text>
                </View>
              </View>
            )}

            <View style={styles.audioControls}>
              <TouchableOpacity
                style={[
                  styles.button,
                  isListeningAudio ? styles.buttonWarning : null,
                  { marginTop: 15 }
                ]}
                onPress={isListeningAudio ? stopAudioListener : startAudioListener}
              >
                <Text style={styles.buttonText}>
                  {isListeningAudio ? "Stop Audio Listener" : "Start Audio Listener"}
                </Text>
              </TouchableOpacity>

              {isListeningAudio && (
                <View style={styles.audioStatsContainer}>
                  <Text style={styles.audioStatsTitle}>Audio Packets Received:</Text>
                  <Text style={styles.audioStatsValue}>{audioPacketsReceived}</Text>
                </View>
              )}

              <View style={styles.transcriptionContainer}>
                <Text style={styles.sectionSubtitle}>Deepgram Transcription</Text>

                <View style={styles.checkboxContainer}>
                  <TouchableOpacity
                    style={[styles.checkbox, enableTranscription && styles.checkboxChecked]}
                    onPress={() => {
                      const newValue = !enableTranscription;
                      setEnableTranscription(newValue);

                      // If disabling, close any active connections
                      if (!newValue && websocketRef.current) {
                        websocketRef.current.close();
                        websocketRef.current = null;

                        if (processingIntervalRef.current) {
                          clearInterval(processingIntervalRef.current);
                          processingIntervalRef.current = null;
                        }
                      }
                    }}
                  >
                    {enableTranscription && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                  <Text style={styles.checkboxLabel}>Enable Transcription</Text>
                </View>

                {enableTranscription && (
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>API Key:</Text>
                    <TextInput
                      style={styles.apiKeyInput}
                      value={deepgramApiKey}
                      onChangeText={(text) => {
                        setDeepgramApiKey(text);
                      }}
                      placeholder="Enter Deepgram API Key"
                      secureTextEntry={true}
                    />
                  </View>
                )}


                {enableTranscription && (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.button,
                        isTranscribing.current ? styles.buttonWarning : null,
                        { marginTop: 15, marginBottom: 15 }
                      ]}
                      onPress={() => {
                        if (isTranscribing.current) {
                          // Stop transcription
                          if (websocketRef.current) {
                            websocketRef.current.close();
                            websocketRef.current = null;
                          }

                          if (processingIntervalRef.current) {
                            clearInterval(processingIntervalRef.current);
                            processingIntervalRef.current = null;
                          }

                          isTranscribing.current = false;
                        } else {
                          // Start transcription
                          if (!deepgramApiKey) {
                            Alert.alert('API Key Required', 'Please enter your Deepgram API key to start transcription');
                            return;
                          }

                          if (!isListeningAudio) {
                            Alert.alert('Audio Required', 'Please start the audio listener first');
                            return;
                          }

                          initializeWebSocketTranscription();
                          setTranscription(''); // Clear previous transcription
                        }
                      }}
                      disabled={!isListeningAudio}
                    >
                      <Text style={styles.buttonText}>
                        {isTranscribing.current ? "Stop Transcription" : "Start Transcription"}
                      </Text>
                    </TouchableOpacity>

                    {transcription && (
                      <View style={styles.transcriptionTextContainer}>
                        <Text style={styles.transcriptionTitle}>Transcription:</Text>
                        <Text style={styles.transcriptionText}>{transcription}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statusBanner: {
    backgroundColor: '#FF9500',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 10,
  },
  statusButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  statusButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  content: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 0,
    paddingBottom: 200,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  section: {
    marginBottom: 25,
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonWarning: {
    backgroundColor: '#FF9500',
  },
  buttonDanger: {
    backgroundColor: '#FF3B30',
  },
  buttonDisabled: {
    backgroundColor: '#A0A0A0',
    opacity: 0.7,
  },
  buttonFull: {
    flex: 1,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  responseContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  responseTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
    color: '#555',
  },
  responseText: {
    fontSize: 14,
    color: '#333',
  },
  deviceList: {
    marginTop: 5,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  deviceInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  codecContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  codecTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  codecValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 5,
  },
  audioControls: {
    marginTop: 10,
  },
  audioStatsContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  audioStatsTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  audioStatsValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9500',
    marginTop: 5,
  },
  batteryContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#4CD964',
  },
  batteryTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  batteryLevelContainer: {
    width: '100%',
    height: 24,
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  batteryLevelBar: {
    height: '100%',
    backgroundColor: '#4CD964',
    borderRadius: 12,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  batteryLevelText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  transcriptionContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  inputContainer: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: '#555',
  },
  apiKeyInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
  },
  transcriptionTextContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  transcriptionTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: '#555',
  },
  transcriptionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    width: '100%',
  },
  status: {
    marginTop: 5,
    fontSize: 14,
    color: '#666',
  },
  buttonSuccess: {
    backgroundColor: '#4CD964',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
  },
  debugButton: {
    backgroundColor: '#8E8E93',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  debugButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  sessionInfo: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  sessionText: {
    fontSize: 12,
    color: '#555',
  },
  debugInfo: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  debugLabel: {
    fontSize: 12,
    color: '#555',
  },
  debugValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#007AFF',
  },
});
