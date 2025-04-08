### Install adafruit-nrfutil

```
pip3 install --user adafruit-nrfutil
```

### Create firmware OTA .zip using adafruit-nrfutil

```bash
adafruit-nrfutil dfu genpkg --dev-type 0x0052 --dev-revision 0xCE68 --application zephyr.hex zephyr.zip
```

### Upgrade firmware using UF2 file

Download the latest version of the firmware ```xiao_nrf52840_ble_sense-XXXX.uf2```
from [Omi firmware releases](https://github.com/BasedHardware/Omi/releases)

Put the board in bootloader mode by double pressing the reset button. The board should appear as a USB drive.

Copy the new firmware file in the root directory of the board. The board will automatically update the firmware and reset back to application mode.
You can check the firmware version from the Omi AI App.

### Upgrade bootloader using UF2 file

Download a compatible version of the ```update-xiao_nrf52840_ble_sense_bootloader-XXX.uf2``` bootloader
from [Adafurit bootloader releases](https://github.com/adafruit/Adafruit_nRF52_Bootloader/releases)
The latest tested version is 0.9.0. Newer versions should work as well.

Put the board in bootloader mode by double pressing the reset button. The board should appear as a USB drive.

Copy the bootloader update file in the root directory of the board. The board will automatically update the bootloader and reset back to application mode.
To check the bootloader was updated, put the board in bootloader mode again and check the INFO_UF2.TXT file for the new bootloader version.

### Bluetooth Data Format for Opus Audio

1. **Codec**: The firmware uses Opus codec for audio compression (defined as `CODEC_ID 20` in the code).

2. **Data Structure**: 
   - When encoding audio data, the opus encoder processes 160 samples at a time (`CODEC_PACKAGE_SAMPLES 160`)
   - The Opus encoding is configured for low-delay optimization (`OPUS_APPLICATION_RESTRICTED_LOWDELAY`)
   - Bitrate is set to 32 kbps (`CODEC_OPUS_BITRATE 32000`)
   - Variable bit rate is enabled (`CODEC_OPUS_VBR 1`)
   - Encoding complexity is set to 3 (`CODEC_OPUS_COMPLEXITY 3`)

3. **Bluetooth Packet Format**:
   - Each Bluetooth packet includes a 3-byte header (`NET_BUFFER_HEADER_SIZE 3`)
   - The header contains:
     - First 2 bytes (Little Endian): A packet ID that increments for each packet
     - Third byte: A frame index that increments if multiple frames are needed for one Opus package

4. **Ring Buffer Format**:
   - Data is stored in a ring buffer with a 2-byte header (`RING_BUFFER_HEADER_SIZE 2`)
   - The header contains the size of the data in the buffer (Little Endian)

5. **Transmission Process**:
   - Audio samples are captured and encoded with Opus
   - The encoded data is put into a ring buffer with a 2-byte header containing the size
   - When sending via Bluetooth, the data is read from the ring buffer
   - The data is then split into packets that fit within the MTU (Maximum Transmission Unit) of the Bluetooth connection
   - Each packet gets the 3-byte header described above
   - The data is sent using BLE GATT notifications to the `audio_service` characteristic with UUID `19B10001-E8F2-537E-4F6C-D104768A1214`

6. **SD Card Storage Format**:
   - When stored on SD card, the opus data uses a slightly different format
   - Each entry is prefixed with a 1-byte length field (`OPUS_PREFIX_LENGTH 1`)
   - Data is written in chunks of up to 440 bytes (`MAX_WRITE_SIZE 440`)

7. **Opus Configuration**:
   - The firmware uses the CELT mode of Opus encoder
   - Sample rate is 16kHz
   - It's configured for single-channel (mono) audio
   - The encoder is optimized for voice transmission

This implementation allows for efficient transmission of audio data over Bluetooth Low Energy (BLE) while maintaining reasonable audio quality with the Opus codec.
